sub main()
    node = createObject("roSGNode", "Node")
    print getInterface(1.123, "ifFloat")
    print findMemberFunction({}, "count")
    print findMemberFunction(node, "findNode")
    print box("boxedString")
end sub
