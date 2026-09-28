import bpy
scene=bpy.data.scenes['RoboSpace_Logistics_Sortation_Highbay_32x22']
bpy.context.window.scene=scene
scene.render.filepath='/tmp/robospace-scenarios/logistics-sortation/thumbnail.png'
bpy.ops.render.render(write_still=True)
print('LOGISTICS_THUMBNAIL_RENDERED')
