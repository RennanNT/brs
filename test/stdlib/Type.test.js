const brs = require("brs");
const { Type } = require("../../lib/stdlib");
const { RoSGNode, RoAssociativeArray, BrsString, Int32, ValueKind } = brs.types;
const { Interpreter } = require("../../lib/interpreter");

describe("global type function", () => {
    let interpreter;
    beforeEach(() => {
        interpreter = new Interpreter();
    });

    it("reports every SceneGraph node as roSGNode, whatever its subtype", () => {
        expect(Type.call(interpreter, new RoSGNode([]))).toEqual(new BrsString("roSGNode"));
        expect(Type.call(interpreter, new RoSGNode([], "Group"))).toEqual(
            new BrsString("roSGNode")
        );
    });

    it("reports other components and primitives by name", () => {
        expect(Type.call(interpreter, new RoAssociativeArray([]))).toEqual(
            new BrsString("roAssociativeArray")
        );
        expect(Type.call(interpreter, new Int32(1))).toEqual(new BrsString("Integer"));
    });
});
