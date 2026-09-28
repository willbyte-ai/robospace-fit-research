import bpy, os
prefix='RoboSpace_Fit__Electronics_Assembly_Cleanroom'
scene=bpy.context.scene if bpy.context.scene.name.startswith(prefix) else next((s for s in reversed(list(bpy.data.scenes)) if s.name.startswith(prefix)),None)
if scene is None:
    with bpy.data.libraries.load('/tmp/robospace-scenarios/electronics-assembly/scene.blend',link=False) as (src,dst):
        dst.scenes=[n for n in src.scenes if n.startswith('RoboSpace_Fit__Electronics_Assembly_Cleanroom')]
    scene=dst.scenes[0]
bpy.context.window.scene=scene
scene.render.filepath='/tmp/robospace-scenarios/electronics-assembly/thumbnail.png'
bpy.ops.render.render(write_still=True,scene=scene.name)
print('Rendered electronics thumbnail',os.path.getsize(scene.render.filepath))
