sub init()
    m.top.stringField = "this value set using m.top"

    print getDefaultTopValue()

    localObj = { objFunction: isMTopInvalid }
    print localObj.objFunction()
    print isMTopInvalid()

    childRect = m.top.findNode("childRectangle")
    print childRect.width
    print childRect.height


    print m.top.getScene() ' => invalid

    sceneNode = CreateObject("roSGNode", "Node")
    sceneNode.id = "scene"
    m.global.addFields({
        scene: sceneNode
    })

    print m.top.getScene().id ' => scene
end sub

function getDefaultTopValue() as string
    return m.top.defaultValueField
end function

function isMTopInvalid() as boolean
    mTopInvalid = true
    if m.top <> invalid
        mTopInvalid = false
    end if
    return mTopInvalid
end function
