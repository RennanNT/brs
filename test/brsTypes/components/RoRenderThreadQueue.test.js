const brs = require("brs");
const {
    RoRenderThreadQueue,
    RoRenderThreadQueueRegistration,
    resetRenderThreadQueue,
    RoAssociativeArray,
    RoDateTime,
    BrsString,
    BrsInvalid,
    Callable,
    StdlibArgument,
    ValueKind,
    Int32,
} = brs.types;
const { Interpreter } = require("../../../lib/interpreter");
const { Scope } = require("../../../lib/interpreter/Environment");

describe("RoRenderThreadQueue", () => {
    let interpreter;
    let queue;
    let received;

    beforeEach(() => {
        resetRenderThreadQueue();
        interpreter = new Interpreter();
        queue = new RoRenderThreadQueue();
        received = [];
        // A handler defined in the "component" scope that registers it.
        interpreter.environment.define(
            Scope.Module,
            "onProbe",
            new Callable("onProbe", {
                signature: {
                    args: [
                        new StdlibArgument("data", ValueKind.Dynamic),
                        new StdlibArgument("msgInfo", ValueKind.Dynamic),
                    ],
                    returns: ValueKind.Void,
                },
                impl: (_interpreter, data, msgInfo) => {
                    received.push({ data, msgInfo });
                    return BrsInvalid.Instance;
                },
            })
        );
    });

    it("stringifies", () => {
        expect(queue.toString()).toEqual("<Component: roRenderThreadQueue>");
    });

    it("returns a registration token from AddMessageHandler", () => {
        let add = queue.getMethod("addmessagehandler");
        let token = add.call(interpreter, new BrsString("probe"), new BrsString("onProbe"));
        expect(token).toBeInstanceOf(RoRenderThreadQueueRegistration);
        expect(token.toString()).toEqual("<Component: roRenderThreadQueueRegistration>");
    });

    it("moves the posted associative array to the handler and empties the source", () => {
        queue
            .getMethod("addmessagehandler")
            .call(interpreter, new BrsString("probe"), new BrsString("onProbe"));
        let nested = new RoAssociativeArray([{ name: new BrsString("b"), value: new Int32(2) }]);
        let data = new RoAssociativeArray([
            { name: new BrsString("a"), value: new Int32(1) },
            { name: new BrsString("nested"), value: nested },
        ]);

        queue.getMethod("postmessage").call(interpreter, new BrsString("probe"), data);

        expect(received).toHaveLength(1);
        let delivered = received[0].data;
        expect(delivered).toBeInstanceOf(RoAssociativeArray);
        expect(delivered).not.toBe(data);
        expect(delivered.get(new BrsString("a"))).toEqual(new Int32(1));
        // Nested objects travel by reference; only the top level is a new container.
        expect(delivered.get(new BrsString("nested"))).toBe(nested);
        expect(data.elements.size).toEqual(0);
        expect(queue.getMethod("numcopies").call(interpreter)).toEqual(new Int32(0));
    });

    it("passes msgInfo with the id and a creation time", () => {
        queue
            .getMethod("addmessagehandler")
            .call(interpreter, new BrsString("Probe"), new BrsString("onProbe"));
        queue
            .getMethod("postmessage")
            .call(interpreter, new BrsString("probe"), new RoAssociativeArray([]));
        let msgInfo = received[0].msgInfo;
        expect(msgInfo.get(new BrsString("id"))).toEqual(new BrsString("probe"));
        expect(msgInfo.get(new BrsString("created"))).toBeInstanceOf(RoDateTime);
    });

    it("is app-wide: every instance's handlers for the id fire, in registration order", () => {
        let other = new RoRenderThreadQueue();
        let order = [];
        interpreter.environment.define(
            Scope.Module,
            "second",
            new Callable("second", {
                signature: {
                    args: [new StdlibArgument("data", ValueKind.Dynamic)],
                    returns: ValueKind.Void,
                },
                impl: () => {
                    order.push("second");
                    return BrsInvalid.Instance;
                },
            })
        );
        interpreter.environment.define(
            Scope.Module,
            "first",
            new Callable("first", {
                signature: {
                    args: [new StdlibArgument("data", ValueKind.Dynamic)],
                    returns: ValueKind.Void,
                },
                impl: () => {
                    order.push("first");
                    return BrsInvalid.Instance;
                },
            })
        );
        queue
            .getMethod("addmessagehandler")
            .call(interpreter, new BrsString("x"), new BrsString("first"));
        other
            .getMethod("addmessagehandler")
            .call(interpreter, new BrsString("x"), new BrsString("second"));

        other
            .getMethod("postmessage")
            .call(interpreter, new BrsString("x"), new RoAssociativeArray([]));

        expect(order).toEqual(["first", "second"]);
    });

    it("copies instead of moving with CopyMessage and counts the copy", () => {
        queue
            .getMethod("addmessagehandler")
            .call(interpreter, new BrsString("probe"), new BrsString("onProbe"));
        let data = new RoAssociativeArray([{ name: new BrsString("a"), value: new Int32(1) }]);

        queue.getMethod("copymessage").call(interpreter, new BrsString("probe"), data);

        expect(data.elements.size).toEqual(1);
        expect(received[0].data.get(new BrsString("a"))).toEqual(new Int32(1));
        expect(queue.getMethod("numcopies").call(interpreter)).toEqual(new Int32(1));
    });

    it("reports an undeliverable message id on stderr without throwing", () => {
        let written = "";
        interpreter.stderr = { write: (s) => (written += s) };
        expect(() =>
            queue
                .getMethod("postmessage")
                .call(interpreter, new BrsString("nobody"), new RoAssociativeArray([]))
        ).not.toThrow();
        expect(written).toContain("could not deliver message-id 'nobody'");
    });
});
