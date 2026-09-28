import bpy, os
scene=next(s for s in bpy.data.scenes if s.get('robospace_slug')=='metal-machining')
bpy.context.window.scene=scene
bpy.ops.render.render(write_still=True,scene=scene.name)
print('METAL_THUMBNAIL',scene.render.filepath)
