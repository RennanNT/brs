import { BrsValue, ValueKind, BrsString, BrsInvalid, BrsBoolean } from "../BrsType";
import { BrsComponent } from "./BrsComponent";
import { BrsType } from "..";
import { Callable, StdlibArgument } from "../Callable";
import { Interpreter } from "../../interpreter";
import { Int32 } from "../Int32";
import { RoAssociativeArray } from "./RoAssociativeArray";
import { RoDateTime } from "./RoDateTime";
import { RoSGNode } from "./RoSGNode";
import { Environment } from "../../interpreter/Environment";
import { BlockEnd } from "../../parser/Statement";
import { Stmt } from "../../parser";

/**
 * A handler registered with `roRenderThreadQueue.AddMessageHandler`. The function
 * is resolved by name in the registering component's scope at dispatch time,
 * exactly like a field observer.
 */
interface QueueHandler {
    interpreter: Interpreter;
    environment: Environment;
    hostNode: RoSGNode | undefined;
    handlerName: string;
}

/**
 * The queue is app-wide on a Roku: every `roRenderThreadQueue` instance shares one
 * set of handlers, and every handler registered for a message id is invoked, in
 * registration order. Task threads are synchronous in brs, so a posted message is
 * delivered immediately instead of being queued for the render thread.
 */
const handlersByMessageId = new Map<string, QueueHandler[]>();
let copies = 0;

/** Clears all registered handlers. Intended for test isolation. */
export function resetRenderThreadQueue() {
    handlersByMessageId.clear();
    copies = 0;
}

/** The token `AddMessageHandler` returns; the device exposes no methods on it. */
export class RoRenderThreadQueueRegistration extends BrsComponent implements BrsValue {
    readonly kind = ValueKind.Object;

    constructor(readonly messageId: string, readonly handler: QueueHandler) {
        super("roRenderThreadQueueRegistration");
        this.registerMethods({});
    }

    toString(parent?: BrsType): string {
        return "<Component: roRenderThreadQueueRegistration>";
    }

    equalTo(other: BrsType) {
        return BrsBoolean.False;
    }

    clone() {
        return this;
    }
}

/**
 * Roku OS 15 / RSG 1.3 `roRenderThreadQueue`: asynchronous, move-based messaging from
 * Task threads to handlers running on the render thread. See
 * https://developer.roku.com/docs/references/brightscript/components/rorenderthreadqueue.md
 */
export class RoRenderThreadQueue extends BrsComponent implements BrsValue {
    readonly kind = ValueKind.Object;

    constructor() {
        super("roRenderThreadQueue");
        this.registerMethods({
            ifRenderThreadQueue: [
                this.addmessagehandler,
                this.postmessage,
                this.copymessage,
                this.numcopies,
            ],
        });
    }

    toString(parent?: BrsType): string {
        return "<Component: roRenderThreadQueue>";
    }

    equalTo(other: BrsType) {
        return BrsBoolean.False;
    }

    /** The queue is app-wide state; every instance is interchangeable. */
    clone() {
        return new RoRenderThreadQueue();
    }

    /**
     * Delivers `data` to every handler registered for `messageId`. Handlers run
     * in the scope of the component that registered them, receiving
     * `(data, msgInfo)` where msgInfo is `{ id, created }`.
     */
    private deliver(interpreter: Interpreter, messageId: BrsString, data: BrsType) {
        let handlers = handlersByMessageId.get(messageId.value.toLowerCase());
        if (!handlers || handlers.length === 0) {
            interpreter.stderr.write(`could not deliver message-id '${messageId.value}'\n`);
            return;
        }

        for (let handler of handlers) {
            let msgInfo = new RoAssociativeArray([
                { name: new BrsString("id"), value: messageId },
                { name: new BrsString("created"), value: new RoDateTime() },
            ]);
            let { environment, hostNode, handlerName } = handler;

            handler.interpreter.inSubEnv((subInterpreter) => {
                if (hostNode) {
                    subInterpreter.environment.hostNode = hostNode;
                    subInterpreter.environment.setM(hostNode.m);
                    subInterpreter.environment.setRootM(hostNode.m);
                }
                let callable = subInterpreter.getCallableFunction(handlerName);
                if (!callable) {
                    interpreter.stderr.write(
                        `roRenderThreadQueue: handler '${handlerName}' for message-id '${messageId.value}' is not a function\n`
                    );
                    return BrsInvalid.Instance;
                }
                try {
                    if (callable.getFirstSatisfiedSignature([data, msgInfo])) {
                        callable.call(subInterpreter, data, msgInfo);
                    } else if (callable.getFirstSatisfiedSignature([data])) {
                        callable.call(subInterpreter, data);
                    } else {
                        callable.call(subInterpreter);
                    }
                } catch (err) {
                    if (!(err instanceof BlockEnd) && !(err instanceof Stmt.ReturnValue)) {
                        throw err;
                    }
                }
                return BrsInvalid.Instance;
            }, environment);
        }
    }

    /** Registers `handlerName` (a function in the calling component) for `messageId`. */
    private addmessagehandler = new Callable("addmessagehandler", {
        signature: {
            args: [
                new StdlibArgument("messageId", ValueKind.String),
                new StdlibArgument("handlerName", ValueKind.String),
            ],
            returns: ValueKind.Object,
        },
        impl: (interpreter: Interpreter, messageId: BrsString, handlerName: BrsString) => {
            let handler: QueueHandler = {
                interpreter,
                environment: interpreter.environment,
                hostNode: interpreter.environment.hostNode,
                handlerName: handlerName.value,
            };
            let key = messageId.value.toLowerCase();
            handlersByMessageId.set(key, [...(handlersByMessageId.get(key) || []), handler]);
            return new RoRenderThreadQueueRegistration(key, handler);
        },
    });

    /**
     * Moves `data` to the handlers: the caller's associative array is emptied and
     * the handlers receive an object holding its former members.
     */
    private postmessage = new Callable("postmessage", {
        signature: {
            args: [
                new StdlibArgument("messageId", ValueKind.String),
                new StdlibArgument("data", ValueKind.Dynamic),
            ],
            returns: ValueKind.Void,
        },
        impl: (interpreter: Interpreter, messageId: BrsString, data: BrsType) => {
            let moved = data;
            if (data instanceof RoAssociativeArray) {
                moved = new RoAssociativeArray([]);
                data.elements.forEach((value, key) => {
                    (moved as RoAssociativeArray).set(new BrsString(key), value);
                });
                data.elements.clear();
            }
            this.deliver(interpreter, messageId, moved);
            return BrsInvalid.Instance;
        },
    });

    /** Like PostMessage, but the handlers receive a copy and the caller keeps `data`. */
    private copymessage = new Callable("copymessage", {
        signature: {
            args: [
                new StdlibArgument("messageId", ValueKind.String),
                new StdlibArgument("data", ValueKind.Dynamic),
            ],
            returns: ValueKind.Void,
        },
        impl: (interpreter: Interpreter, messageId: BrsString, data: BrsType) => {
            copies += 1;
            this.deliver(interpreter, messageId, data.clone());
            return BrsInvalid.Instance;
        },
    });

    /** Number of objects copied rather than moved. brs never needs to copy on PostMessage. */
    private numcopies = new Callable("numcopies", {
        signature: {
            args: [],
            returns: ValueKind.Int32,
        },
        impl: (_: Interpreter) => {
            return new Int32(copies);
        },
    });
}
