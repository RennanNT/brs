const brs = require("brs");
const {
    RoSGNode,
    RoAssociativeArray,
    BrsString,
    BrsInvalid,
    BrsBoolean,
    Int32,
    Callable,
    ValueKind,
} = brs.types;
const { Interpreter } = require("../../../lib/interpreter");
const { Scope } = require("../../../lib/interpreter/Environment");

describe("RoSGNode RSG 1.3 data transfer", () => {
    let interpreter;
    let node;

    const aa = (members) =>
        new RoAssociativeArray(
            Object.entries(members).map(([k, v]) => ({ name: new BrsString(k), value: v }))
        );

    beforeEach(() => {
        interpreter = new Interpreter();
        node = new RoSGNode([{ name: new BrsString("box"), value: aa({}) }]);
    });

    describe("MoveIntoField", () => {
        it("moves the members into the field and empties the source", () => {
            let nested = aa({ b: new Int32(2) });
            let src = aa({ a: new Int32(1), nested });

            let copies = node
                .getMethod("moveintofield")
                .call(interpreter, new BrsString("box"), src);

            expect(copies).toEqual(new Int32(0));
            expect(src.elements.size).toEqual(0);
            let box = node.get(new BrsString("box"));
            expect(box.get(new BrsString("a"))).toEqual(new Int32(1));
            expect(box.get(new BrsString("nested"))).toBe(nested);
        });

        it("notifies field observers, as the device does", () => {
            let fired = 0;
            interpreter.environment.define(
                Scope.Module,
                "onBox",
                new Callable("onBox", {
                    signature: { args: [], returns: ValueKind.Void },
                    impl: () => {
                        fired += 1;
                        return BrsInvalid.Instance;
                    },
                })
            );
            interpreter.environment.hostNode = node;
            node.getMethod("observefield").call(
                interpreter,
                new BrsString("box"),
                new BrsString("onBox")
            );

            node.getMethod("moveintofield").call(
                interpreter,
                new BrsString("box"),
                aa({ a: new Int32(1) })
            );

            expect(fired).toEqual(1);
        });

        it("refuses a field that is not an associative array and leaves the source intact", () => {
            let written = "";
            interpreter.stderr = { write: (s) => (written += s) };
            let strNode = new RoSGNode([
                { name: new BrsString("label"), value: new BrsString("x") },
            ]);
            let src = aa({ a: new Int32(1) });

            let copies = strNode
                .getMethod("moveintofield")
                .call(interpreter, new BrsString("label"), src);

            expect(copies).toEqual(new Int32(0));
            expect(src.elements.size).toEqual(1);
            expect(written).toContain("MoveIntoField");
        });
    });

    describe("MoveFromField", () => {
        it("returns the field's array untouched and leaves the field invalid", () => {
            let stored = aa({ a: new Int32(1) });
            node.set(new BrsString("box"), stored);

            let moved = node.getMethod("movefromfield").call(interpreter, new BrsString("box"));

            // brs shares the assigned object with the caller, so it must not be emptied.
            expect(moved).toBe(stored);
            expect(stored.elements.size).toEqual(1);
            expect(node.get(new BrsString("box"))).toBe(BrsInvalid.Instance);
        });

        it("returns invalid for an empty or unknown field", () => {
            interpreter.stderr = { write: () => {} };
            node.set(new BrsString("box"), BrsInvalid.Instance);
            expect(node.getMethod("movefromfield").call(interpreter, new BrsString("box"))).toBe(
                BrsInvalid.Instance
            );
            expect(node.getMethod("movefromfield").call(interpreter, new BrsString("nope"))).toBe(
                BrsInvalid.Instance
            );
        });

        it("round-trips with MoveIntoField", () => {
            let src = aa({ a: new Int32(1) });
            node.getMethod("moveintofield").call(interpreter, new BrsString("box"), src);
            let back = node.getMethod("movefromfield").call(interpreter, new BrsString("box"));
            expect(back.get(new BrsString("a"))).toEqual(new Int32(1));
            expect(node.get(new BrsString("box"))).toBe(BrsInvalid.Instance);
        });
    });

    describe("SetRef / GetRef / CanGetRef", () => {
        it("stores and returns the same object by reference", () => {
            let data = aa({ a: new Int32(1) });
            expect(node.getMethod("setref").call(interpreter, new BrsString("box"), data)).toBe(
                BrsBoolean.True
            );
            expect(node.getMethod("cangetref").call(interpreter, new BrsString("box"))).toBe(
                BrsBoolean.True
            );
            expect(node.getMethod("getref").call(interpreter, new BrsString("box"))).toBe(data);
        });

        it("reports false / invalid for unknown fields", () => {
            expect(node.getMethod("setref").call(interpreter, new BrsString("nope"), aa({}))).toBe(
                BrsBoolean.False
            );
            expect(node.getMethod("cangetref").call(interpreter, new BrsString("nope"))).toBe(
                BrsBoolean.False
            );
            expect(node.getMethod("getref").call(interpreter, new BrsString("nope"))).toBe(
                BrsInvalid.Instance
            );
        });
    });
});
