"""Original concept equipment for RoboSpace Fit, in meters (XY ground, Z up).
Run this source with Blender MCP. Existing scenes and objects are preserved.
Each asset is batched by material for efficient web rendering. No OEM CAD/textures.
"""
import bpy, math, json
from pathlib import Path
from collections import defaultdict
from mathutils import Vector
import io_scene_gltf2

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'public' / 'models' / 'equipment'
PALETTE = {
    'Brushed steel': ((.43, .45, .49), .84, .27),
    'Bright machined': ((.70, .72, .76), .90, .21),
    'Graphite powder coat': ((.055, .060, .070), .48, .40),
    'Black polymer': ((.017, .020, .026), .04, .71),
    'Metallic blue': ((.018, .075, .42), .67, .27),
    'Smoked sensor glass': ((.010, .016, .032), .35, .12),
    'Zinc fastener': ((.18, .20, .23), .92, .25),
    'Pale composite': ((.49, .50, .52), .12, .59),
    'White marking': ((.84, .86, .89), .20, .42),
}

class Builder:
    def __init__(self, asset_id, name, size, description):
        self.asset_id, self.name, self.size, self.description = asset_id, name, size, description
        self.scene = bpy.data.scenes.new('RoboSpace_Equipment_' + asset_id)
        bpy.context.window.scene = self.scene
        self.asset = bpy.data.collections.new(asset_id + '_ASSET')
        self.studio = bpy.data.collections.new(asset_id + '_STUDIO')
        self.scene.collection.children.link(self.asset)
        self.scene.collection.children.link(self.studio)
        self.batches = defaultdict(lambda: [[], [], []])
        self.materials = {}
        for key, (color, metallic, roughness) in PALETTE.items():
            material = bpy.data.materials.new(asset_id + '_' + key)
            material.use_nodes = True
            material.diffuse_color = (*color, 1)
            principled = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
            principled.inputs['Base Color'].default_value = (*color, 1)
            principled.inputs['Metallic'].default_value = metallic
            principled.inputs['Roughness'].default_value = roughness
            self.materials[key] = material

    def geometry(self, material, vertices, faces, smooth=False):
        batch = self.batches[material]
        offset = len(batch[0])
        batch[0].extend(tuple(v) for v in vertices)
        batch[1].extend(tuple(offset + i for i in face) for face in faces)
        batch[2].extend([smooth] * len(faces))

    def box(self, material, center, size, bevel=.003, rotation=None):
        x, y, z = [v / 2 for v in size]
        if min(size) < .004:
            vertices = [Vector((vx*x,vy*y,vz*z)) for vx,vy,vz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
            if rotation is not None:
                vertices = [rotation @ v for v in vertices]
            self.geometry(material,[Vector(center)+v for v in vertices],[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
            return
        r = min(bevel, min(x, y, z) * .7)
        ring = [(-x+r,-y),(x-r,-y),(x,-y+r),(x,y-r),(x-r,y),(-x+r,y),(-x,y-r),(-x,-y+r)]
        vertices = []
        for height, inset in [(-z, r*.5), (-z+r, 0), (z-r, 0), (z, r*.5)]:
            for vx, vy in ring:
                v = Vector((vx-math.copysign(inset,vx), vy-math.copysign(inset,vy), height))
                if rotation is not None:
                    v = rotation @ v
                vertices.append(Vector(center) + v)
        faces = [tuple(reversed(range(8))), tuple(range(24,32))]
        for j in range(3):
            faces.extend((j*8+i,j*8+(i+1)%8,(j+1)*8+(i+1)%8,(j+1)*8+i) for i in range(8))
        self.geometry(material, vertices, faces)

    def lathe(self, material, center, axis, profile, segments=24):
        p, u = Vector(center), Vector(axis).normalized()
        v = u.cross(Vector((0,0,1)))
        if v.length < .1:
            v = u.cross(Vector((0,1,0)))
        v.normalize()
        w = u.cross(v).normalized()
        vertices = []
        for distance, radius in profile:
            for i in range(segments):
                angle = math.tau*i/segments
                vertices.append(p+u*distance+(v*math.cos(angle)+w*math.sin(angle))*radius)
        faces = [tuple(reversed(range(segments))), tuple(range((len(profile)-1)*segments,len(profile)*segments))]
        for j in range(len(profile)-1):
            faces.extend((j*segments+i,j*segments+(i+1)%segments,(j+1)*segments+(i+1)%segments,(j+1)*segments+i) for i in range(segments))
        # Keep cylinder end faces flat while smoothing the revolving side surfaces.
        self.geometry(material, vertices, faces)
        self.batches[material][2][-len(faces):] = [False, False] + [True]*(len(faces)-2)

    def cylinder(self, material, start, end, radius, segments=20, end_radius=None):
        a, b = Vector(start), Vector(end)
        self.lathe(material, a, b-a, [(0,radius), ((b-a).length,radius if end_radius is None else end_radius)], segments)

    def beam(self, material, start, end, width, depth=None, bevel=.002):
        a, b = Vector(start), Vector(end)
        rotation = (b-a).to_track_quat('Z','Y')
        self.box(material,(a+b)/2,(width,depth or width,(b-a).length),bevel,rotation)

    def bolt(self, center, axis=(0,0,1), radius=.005):
        p, u = Vector(center), Vector(axis).normalized()
        self.cylinder('Bright machined', p-u*.001, p+u*.001, radius*1.35,12)
        self.cylinder('Zinc fastener',p+u*.001,p+u*.0045,radius,6)
        self.cylinder('Black polymer',p+u*.0045,p+u*.0048,radius*.38,6)

    def cable(self, points, radius=.004, material='Black polymer'):
        for a,b in zip(points,points[1:]):
            self.cylinder(material,a,b,radius,10)

    def finish(self, camera_position, look_at, ortho_scale, details):
        output = OUT / self.asset_id
        output.mkdir(parents=True,exist_ok=True)
        objects = []
        for material,(vertices,faces,smooth) in self.batches.items():
            mesh = bpy.data.meshes.new(self.asset_id+'_'+material)
            mesh.from_pydata(vertices,[],faces)
            mesh.materials.append(self.materials[material])
            mesh.update()
            for polygon,flag in zip(mesh.polygons,smooth):
                polygon.use_smooth = flag
            ob=bpy.data.objects.new(self.asset_id+'_'+material,mesh)
            self.asset.objects.link(ob)
            ob['asset_id']=self.asset_id
            ob['equipment_type']=self.asset_id
            objects.append(ob)
        for ob in self.scene.objects:
            ob.select_set(False)
        for ob in objects:
            ob.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        formats={x[0] for x in io_scene_gltf2.get_format_items(None,bpy.context)}
        if 'GLB' not in formats:
            raise RuntimeError('GLB export is unavailable')
        bpy.ops.export_scene.gltf(filepath=str(output/'asset.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_extras=True,export_apply=False)
        # Non-exported studio provides clean material reflections in the editable scene.
        floor_material=bpy.data.materials.new(self.asset_id+'_studio_floor')
        floor_material.diffuse_color=(.055,.061,.072,1)
        floor_material.use_nodes=True
        bsdf=next(n for n in floor_material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        bsdf.inputs['Base Color'].default_value=(.055,.061,.072,1)
        bsdf.inputs['Roughness'].default_value=.38
        mesh=bpy.data.meshes.new(self.asset_id+'_studio_floor')
        mesh.from_pydata([(-20,-20,-.006),(20,-20,-.006),(20,20,-.006),(-20,20,-.006)],[],[(0,1,2,3)])
        mesh.materials.append(floor_material)
        floor=bpy.data.objects.new(self.asset_id+'_studio_floor',mesh)
        self.studio.objects.link(floor)
        world=bpy.data.worlds.new(self.asset_id+'_studio_world')
        self.scene.world=world
        world.use_nodes=True
        background=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
        background.inputs['Color'].default_value=(.17,.19,.24,1)
        background.inputs['Strength'].default_value=.65
        types={i.identifier for i in bpy.types.Light.bl_rna.properties['type'].enum_items}
        if 'AREA' not in types:
            raise RuntimeError('AREA light is unavailable')
        span=max(self.size)
        for suffix,position,energy,size in [
            ('Key',(span*.6,-span*1.5,span*2),span*span*250,span*1.5),
            ('Rim',(-span,span*.8,span*1.5),span*span*320,span),
            ('Fill',(span*1.3,span,span),span*span*150,span*1.5),
            ('Top',(0,0,span*2.8),span*span*100,span*.7),
        ]:
            ld=bpy.data.lights.new(self.asset_id+'_'+suffix,'AREA')
            ld.energy=energy
            ld.shape='DISK' if 'DISK' in {i.identifier for i in ld.bl_rna.properties['shape'].enum_items} else 'SQUARE'
            ld.size=size
            light=bpy.data.objects.new(self.asset_id+'_'+suffix,ld)
            self.studio.objects.link(light)
            light.location=position
            light.rotation_euler=(Vector(look_at)-light.location).to_track_quat('-Z','Y').to_euler()
        cd=bpy.data.cameras.new(self.asset_id+'_camera')
        camera=bpy.data.objects.new(self.asset_id+'_camera',cd)
        self.studio.objects.link(camera)
        camera.location=camera_position
        camera.rotation_euler=(Vector(look_at)-camera.location).to_track_quat('-Z','Y').to_euler()
        if 'ORTHO' in {i.identifier for i in cd.bl_rna.properties['type'].enum_items}:
            cd.type='ORTHO'
        cd.ortho_scale=ortho_scale
        self.scene.camera=camera
        try:
            self.scene.render.engine='BLENDER_EEVEE'
        except TypeError:
            pass
        self.scene.render.resolution_x=1200
        self.scene.render.resolution_y=1000
        self.scene.render.resolution_percentage=100
        if 'PNG' in {i.identifier for i in self.scene.render.image_settings.bl_rna.properties['file_format'].enum_items}:
            self.scene.render.image_settings.file_format='PNG'
        self.scene.render.filepath=str(output/'thumbnail.png')
        self.scene.render.film_transparent=False
        bpy.ops.render.render(write_still=True)
        triangle_count=sum(len(p.vertices)-2 for ob in objects for p in ob.data.polygons)
        minimum=[min(v.co[i] for ob in objects for v in ob.data.vertices) for i in range(3)]
        maximum=[max(v.co[i] for ob in objects for v in ob.data.vertices) for i in range(3)]
        manifest={
            'id':self.asset_id,'name':self.name,'description':self.description,
            'modelKind':'original-concept-equipment','units':'meters','upAxis':'Z',
            'origin':'ground center','dimensions':{'width':self.size[0],'depth':self.size[1],'height':self.size[2]},
            'geometry':{'meshCount':len(objects),'materialCount':len(objects),'triangleCount':triangle_count,'bounds':{'min':minimum,'max':maximum}},
            'details':details,'note':'Original conceptual visualization, not manufacturer CAD or certified equipment specifications.'
        }
        (output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
        bpy.data.libraries.write(str(output/'scene.blend'),{self.scene},fake_user=True,compress=True)
        for area in bpy.context.screen.areas:
            if area.type=='VIEW_3D':
                area.spaces.active.region_3d.view_location=Vector(look_at)
                area.spaces.active.region_3d.view_distance=ortho_scale*1.5
                area.spaces.active.region_3d.view_rotation=camera.rotation_euler.to_quaternion()
        print(json.dumps({'id':self.asset_id,'output':str(output),'triangles':triangle_count,'meshes':len(objects),'scene':self.scene.name}))
        return manifest


def conveyor():
    b=Builder('roller-conveyor','구동 롤러 컨베이어',(3.0,.85,.90),'기어모터, 광전 센서, 케이블 트레이와 높이 조절 다리를 갖춘 구동 롤러 컨베이어')
    # Fabricated C channels have actual open undersides and separate stainless wear strips.
    for y in [-.326,.326]:
        b.box('Graphite powder coat',(0,y,.759),(3,.025,.126),.004)
        for z in [.704,.814]:
            b.box('Brushed steel',(0,y-math.copysign(.013,y),z),(3,.050,.015),.002)
        b.box('Bright machined',(0,y,.828),(2.99,.035,.012),.002)
        for x in [-1.40,-.78,0,.78,1.40]:
            b.bolt((x,y-math.copysign(.014,y),.761),(0,-math.copysign(1,y),0),.006)
    # 37 independent steel rollers, end caps, shafts, bearing sockets and chain-side hub covers.
    for index in range(37):
        x=-1.44+index*.08
        b.lathe('Brushed steel',(x,-.298,.797),(0,1,0),[(0,.029),(.004,.0325),(.588,.0325),(.596,.029)],24)
        for sign in [-1,1]:
            b.cylinder('Black polymer',(x,sign*.296,.797),(x,sign*.311,.797),.026,16)
            b.cylinder('Bright machined',(x,sign*.305,.797),(x,sign*.335,.797),.009,12)
            b.cylinder('Zinc fastener',(x,sign*.337,.797),(x,sign*.342,.797),.015,12)
    # Full length enclosed timing-belt transmission underneath the operator-side rail.
    b.box('Graphite powder coat',(0,.366,.765),(2.91,.049,.090),.006)
    for x in [-1.36,-.91,-.46,0,.46,.91,1.36]:
        b.bolt((x,.392,.768),(0,1,0),.004)
    # Three support portals, each with wide floor pads, threaded leveling feet and diagonal braces.
    for x in [-1.17,0,1.17]:
        for y in [-.265,.265]:
            b.box('Graphite powder coat',(x,y,.421),(.056,.056,.626),.004)
            b.box('Brushed steel',(x,y,.711),(.115,.10,.028),.003)
            b.cylinder('Bright machined',(x,y,.026),(x,y,.135),.012,16)
            for z in [.050,.071,.095]:
                b.cylinder('Zinc fastener',(x,y,z),(x,y,z+.009),.019,6)
            b.lathe('Black polymer',(x,y,0),(0,0,1),[(0,.041),(.008,.045),(.018,.043),(.023,.028)],24)
            b.bolt((x+.030,y,.728),radius=.005)
            b.bolt((x-.030,y,.728),radius=.005)
        b.box('Brushed steel',(x,0,.22),(.042,.55,.042),.003)
        b.beam('Brushed steel',(x,-.27,.24),(x,.27,.67),.024)
    for y in [-.26,.26]:
        b.box('Brushed steel',(0,y,.245),(2.38,.035,.035),.003)
        b.beam('Brushed steel',(-1.15,y,.26),(-.57,y,.69),.025)
        b.beam('Brushed steel',(.56,y,.69),(1.15,y,.26),.025)
    # Motor housing includes cooling fins, gearbox, output shaft, mounting lugs and cable gland.
    b.box('Graphite powder coat',(.98,.307,.580),(.23,.14,.105),.009)
    b.box('Brushed steel',(.91,.307,.635),(.16,.14,.037),.006)
    b.cylinder('Bright machined',(.915,.30,.635),(.915,.30,.731),.025,24)
    b.lathe('Brushed steel',(.825,.299,.558),(1,0,0),[(0,.052),(.01,.062),(.21,.062),(.24,.044)],32)
    for i in range(10):
        b.cylinder('Graphite powder coat',(.845+i*.018,.299,.558),(.852+i*.018,.299,.558),.067,24)
    b.cylinder('Black polymer',(1.062,.299,.558),(1.080,.299,.558),.052,24)
    for i in range(6):
        a=i*math.tau/6
        b.bolt((1.082,.299+math.cos(a)*.035,.558+math.sin(a)*.035),(1,0,0),.004)
    # Cable tray and discrete motor/sensor wiring route physically along the chassis.
    b.box('Graphite powder coat',(0,-.27,.640),(2.8,.090,.025),.003)
    for x in [-1.28,-1.0,-.72,-.44,-.16,.12,.40,.68,.96,1.24]:
        b.box('Black polymer',(x,-.27,.656),(.12,.05,.003),.0006)
    b.cable([(.90,.31,.57),(.73,.31,.55),(.73,-.27,.55),(.73,-.27,.658),(-.85,-.27,.658)],.005)
    for x in [-1.22,1.22]:
        for sign in [-1,1]:
            y=sign*.389
            b.box('Brushed steel',(x,y,.824),(.045,.025,.105),.003)
            b.box('Graphite powder coat',(x,y,.867),(.070,.065,.048),.005)
            b.cylinder('Smoked sensor glass',(x,y-sign*.034,.867),(x,y-sign*.039,.867),.011,16)
            b.box('Metallic blue',(x+.023,y,.892),(.013,.021,.003),.001)
            b.cable([(x,y,.844),(x,y,.717),(x,-.27,.717),(x,-.27,.653)],.003)
    # One local control pod and rails whose extremities establish the 0.90 m height.
    b.box('Graphite powder coat',(-.68,-.366,.734),(.20,.115,.074),.008)
    b.box('Metallic blue',(-.71,-.422,.735),(.065,.006,.034),.003)
    b.cylinder('Zinc fastener',(-.62,-.421,.735),(-.62,-.425,.735),.014,16)
    for y in [-.305,.305]:
        b.box('Brushed steel',(0,y,.891),(2.90,.012,.018),.003)
        for x in [-1.2,-.4,.4,1.2]:
            b.box('Brushed steel',(x,y,.864),(.022,.022,.067),.002)
    b.box('White marking',(-.94,-.340,.750),(.18,.002,.045),.001)
    for i in range(6):
        b.box('Graphite powder coat',(-1.010+i*.024,-.342,.750),(.009,.001,.028),.0002)
    return b.finish((3.8,-4.8,3.0),(0,0,.42),3.65,[
        '37 chamfered steel rollers with independent shafts and bearing covers',
        'Three braced support portals with threaded leveling feet',
        'Finned gearmotor, enclosed transmission, cable tray and routed wiring',
        'Paired photoelectric sensors and local control pod',
        'Open C-channel side frames and adjustable stainless guide rails'])


def amr():
    b=Builder('amr-cart','리프트형 자율주행 운반로봇',(1.0,.75,.80),'범퍼, 안전 스캐너, 구동 휠과 승강 데크를 갖춘 자율주행 운반로봇 개념 모델')
    # Chamfered shell, lower perimeter bumper and replaceable access panels.
    b.box('Graphite powder coat',(0,0,.212),(.97,.706,.240),.05)
    b.box('Black polymer',(0,0,.105),(1,.75,.068),.030)
    b.box('Brushed steel',(0,0,.320),(.94,.69,.045),.032)
    b.box('Pale composite',(0,0,.351),(.88,.645,.027),.025)
    for sign in [-1,1]:
        y=sign*.357
        b.box('Brushed steel',(0,y,.219),(.48,.018,.12),.010)
        for x in [-.215,.215]:
            for z in [.173,.264]:
                b.bolt((x,y+sign*.01,z),(0,sign,0),.004)
        # Service vents are narrow recessed cutout-like dark plates.
        for x in [-.18,-.135,-.09,-.045,0,.045,.09,.135,.18]:
            b.box('Black polymer',(x,y+sign*.010,.218),(.012,.004,.059),.002)
        b.box('Metallic blue',(-.32,y+sign*.010,.281),(.16,.004,.017),.003)
        b.box('Metallic blue',(.32,y+sign*.010,.281),(.16,.004,.017),.003)
    # Differential drive wheels sit in the lower body wheel arches.
    for sign in [-1,1]:
        y=sign*.321
        b.lathe('Black polymer',(0,y-sign*.046,.111),(0,sign,0),[(0,.087),(.012,.102),(.073,.102),(.086,.088)],32)
        b.cylinder('Zinc fastener',(0,y+sign*.041,.111),(0,y+sign*.044,.111),.063,24)
        b.cylinder('Bright machined',(0,y+sign*.045,.111),(0,y+sign*.048,.111),.034,24)
        for i in range(6):
            a=i*math.tau/6
            b.bolt((math.cos(a)*.044,y+sign*.049,.111+math.sin(a)*.044),(0,sign,0),.003)
        # Visual tread patches follow the wheel circumference without expensive boolean cuts.
        for i in range(20):
            a=i*math.tau/20
            b.beam('Graphite powder coat',(math.sin(a)*.102,y-sign*.028,.111+math.cos(a)*.102),(math.sin(a)*.102,y+sign*.028,.111+math.cos(a)*.102),.008,.009,.001)
    for x in [-.355,.355]:
        for y in [-.240,.240]:
            b.cylinder('Zinc fastener',(x,y,.060),(x,y,.132),.022,16)
            b.box('Brushed steel',(x,y,.080),(.087,.069,.022),.005)
            b.cylinder('Black polymer',(x,y-.025,.047),(x,y+.025,.047),.047,24)
            b.cylinder('Bright machined',(x,y+.026,.047),(x,y+.029,.047),.024,16)
    # Front and rear curved-edge sensor windows plus physical bumpers and docking contacts.
    for sign in [-1,1]:
        x=sign*.481
        b.box('Smoked sensor glass',(x,0,.238),(.020,.49,.063),.018)
        for y in [-.135,.135]:
            b.cylinder('Zinc fastener',(x+sign*.010,y,.239),(x+sign*.014,y,.239),.021,20)
            b.cylinder('Smoked sensor glass',(x+sign*.014,y,.239),(x+sign*.016,y,.239),.014,20)
        b.box('Metallic blue',(x+sign*.011,0,.272),(.004,.29,.009),.002)
        b.box('Black polymer',(sign*.492,0,.114),(.015,.48,.037),.010)
    for y in [-.075,.075]:
        b.box('Zinc fastener',(-.499,y,.159),(.002,.044,.044),.004)
    b.box('Black polymer',(-.465,-.248,.292),(.055,.038,.014),.004)
    b.box('White marking',(.487,.246,.224),(.009,.079,.035),.003)
    # Raised lifting platform: paired guide columns, telescopic sleeves and lead screws.
    for x in [-.30,.30]:
        for y in [-.215,.215]:
            b.box('Graphite powder coat',(x,y,.473),(.074,.074,.22),.007)
            b.box('Bright machined',(x,y,.626),(.046,.046,.20),.003)
            b.box('Zinc fastener',(x,y,.573),(.091,.091,.025),.003)
            for dx in [-.032,.032]:
                b.bolt((x+dx,y,.587),radius=.003)
    for y in [-.14,.14]:
        b.cylinder('Brushed steel',(0,y,.365),(0,y,.70),.020,20)
        for i in range(21):
            b.cylinder('Zinc fastener',(0,y,.405+i*.010),(0,y,.408+i*.010),.025,16)
        b.box('Graphite powder coat',(0,y,.656),(.088,.088,.083),.007)
    # Diagonal bracing helps make the lift a visibly different structure from a cabinet.
    for y in [-.185,.185]:
        b.beam('Brushed steel',(-.235,y,.380),(.235,y,.690),.032,.048,.004)
        b.beam('Graphite powder coat',(.235,y,.380),(-.235,y,.690),.032,.035,.004)
        b.cylinder('Bright machined',(0,y-.032,.535),(0,y+.032,.535),.024,24)
    b.box('Graphite powder coat',(0,0,.727),(.86,.62,.048),.012)
    b.box('Brushed steel',(0,0,.759),(.92,.675,.028),.009)
    b.box('Pale composite',(0,0,.776),(.885,.641,.006),.004)
    for x in [-.39,.39]:
        b.box('Black polymer',(x,0,.789),(.051,.56,.022),.005)
        for y in [-.24,.24]:
            b.bolt((x,y,.794),radius=.004)
    for y in [-.262,.262]:
        b.box('Black polymer',(0,y,.788),(.61,.032,.022),.004)
    for x in [-.28,-.14,0,.14,.28]:
        for y in [-.17,.17]:
            b.cylinder('Black polymer',(x,y,.779),(x,y,.780),.009,16)
    # Low-profile safety lidar, stop mushroom, charger socket and display remain visible on the front deck.
    b.lathe('Graphite powder coat',(.371,0,.363),(0,0,1),[(0,.038),(.012,.042),(.046,.042),(.051,.032)],32)
    b.cylinder('Smoked sensor glass',(.371,0,.386),(.371,0,.404),.0425,32)
    b.box('Metallic blue',(.370,-.036,.411),(.026,.012,.005),.002)
    b.cylinder('Bright machined',(-.352,-.246,.364),(-.352,-.246,.373),.026,24)
    b.cylinder('Metallic blue',(-.352,-.246,.373),(-.352,-.246,.393),.021,24)
    b.cylinder('Graphite powder coat',(-.352,-.246,.393),(-.352,-.246,.399),.026,24)
    b.box('Graphite powder coat',(-.36,.255,.371),(.11,.077,.022),.006)
    b.box('Smoked sensor glass',(-.36,.255,.383),(.082,.049,.002),.003)
    for i in range(3):
        b.box('White marking',(-.386+i*.021,.254,.385),(.013,.025,.001),.001)
    b.cable([(.04,-.14,.43),(.12,-.14,.40),(.20,-.17,.40),(.26,-.19,.61),(.30,-.20,.716)],.007)
    return b.finish((1.75,-2.3,1.5),(0,0,.38),1.65,[
        'Chamfered chassis with replaceable bumper ring and service panels',
        'Differential drive wheels, molded tire tread and four swivel caster assemblies',
        'Front/rear depth sensors, lidar window, docking contacts and local display',
        'Four guided telescopic lifting columns, paired lead screws and cross braces',
        'Raised loading deck with rubber support strips and mounting holes'])


def pallet_rack():
    b=Builder('pallet-rack','3단 팔레트 랙',(2.4,1.2,3.0),'브레이싱, 연결 핀, 앵커 베이스와 팔레트 적재물을 포함한 3단 보관 랙')
    # Four open-channel uprights with regular slot plates and separate base anchors.
    for x in [-1.15,1.15]:
        for y in [-.535,.535]:
            b.box('Graphite powder coat',(x,y,1.52),(.052,.090,2.96),.002)
            for sign in [-1,1]:
                b.box('Brushed steel',(x+sign*.025,y+sign*.005,1.52),(.014,.077,2.96),.002)
            b.box('Brushed steel',(x,y,.024),(.100,.13,.048),.005)
            for dx in [-.032,.032]:
                for dy in [-.042,.042]:
                    b.bolt((x+dx,y+dy,.049),radius=.007)
            # Slots are dark recess plates, not surface textures.
            for i in range(29):
                z=.20+i*.095
                b.box('Black polymer',(x,y-.046,z),(.019,.0015,.035),.005)
                b.box('Black polymer',(x,y+.046,z),(.019,.0015,.035),.005)
            b.box('Metallic blue',(x,y,.18),(.079,.109,.225),.006)
    # Side truss panels preserve open views through the rack.
    for x in [-1.15,1.15]:
        for z in [.24,1.08,1.93,2.78]:
            b.box('Brushed steel',(x,0,z),(.035,1.08,.035),.002)
        for low, high, flip in [(.24,1.08,False),(1.08,1.93,True),(1.93,2.78,False)]:
            a=-.51 if not flip else .51
            b.beam('Brushed steel',(x,a,low),(x,-a,high),.027,.034,.002)
    for z in [.36,1.24,2.12]:
        for y in [-.518,.518]:
            b.box('Brushed steel',(0,y,z),(2.27,.090,.105),.004)
            b.box('Graphite powder coat',(0,y-.047,z-.031),(2.15,.010,.016),.001)
            for x in [-1.075,1.075]:
                b.box('Graphite powder coat',(x,y,z+.020),(.10,.105,.19),.004)
                for h in [-.052,.052]:
                    b.bolt((x,y-.054,z+.020+h),(0,-1,0),.006)
        # Five galvanised support bars form a pallet-bearing deck.
        for x in [-.88,-.44,0,.44,.88]:
            b.box('Zinc fastener',(x,0,z+.017),(.045,1.02,.056),.002)
    # Rear falling-load arrest bars and diagonal restraint straps.
    for z in [.71,1.59,2.47]:
        b.box('Graphite powder coat',(0,.573,z),(2.28,.024,.032),.002)
    b.beam('Zinc fastener',(-1.12,.57,.42),(1.12,.57,2.86),.015,.012,.001)
    b.beam('Zinc fastener',(1.12,.57,.42),(-1.12,.57,2.86),.015,.012,.001)
    # Six pallets. Lower and middle levels carry ribbed bins, upper level carries paired cases.
    for level,base in enumerate([.425,1.305,2.185]):
        for column,cx in enumerate([-.565,.565]):
            for y in [-.36,0,.36]:
                for dx in [-.36,0,.36]:
                    b.box('Graphite powder coat',(cx+dx,y,base+.048),(.105,.135,.089),.008)
            for y in [-.38,0,.38]:
                b.box('Pale composite',(cx,y,base+.012),(.99,.105,.024),.003)
            for xoffset in [-.40,-.20,0,.20,.40]:
                b.box('Pale composite',(cx+xoffset,0,base+.111),(.158,.98,.034),.004)
            if level < 2:
                # Returnable molded crate with lid, corner ribs, inset hand grips and asset label.
                cz=base+.375
                b.box('Pale composite',(cx,0,cz),(.88,.84,.492),.017)
                b.box('Graphite powder coat',(cx,0,base+.631),(.92,.87,.034),.010)
                b.box('Brushed steel',(cx,0,base+.650),(.86,.81,.012),.007)
                for y in [-.426,.426]:
                    for dx in [-.36,-.18,0,.18,.36]:
                        b.box('Brushed steel',(cx+dx,y,cz),(.018,.016,.409),.003)
                    b.box('Black polymer',(cx,y-math.copysign(.01,y),base+.49),(.15,.012,.035),.008)
                for dx in [-.448,.448]:
                    for y in [-.32,0,.32]:
                        b.box('Brushed steel',(cx+dx,y,cz),(.016,.023,.409),.003)
                b.box('White marking',(cx-.20,-.438,base+.35),(.14,.003,.070),.002)
                for i in range(6):
                    b.box('Graphite powder coat',(cx-.254+i*.020,-.441,base+.35),(.007,.001,.045),.0003)
                if level==0 and column==0:
                    b.box('Metallic blue',(cx,-.444,base+.57),(.65,.006,.014),.002)
            else:
                for row,yy in enumerate([-.225,.225]):
                    b.box('Graphite powder coat',(cx,yy,base+.38),(.90,.413,.50),.012)
                    b.box('Pale composite',(cx,yy,base+.63),(.93,.439,.026),.006)
                    for dx in [-.35,.35]:
                        b.box('Brushed steel',(cx+dx,yy,base+.389),(.023,.416,.519),.003)
                    b.box('White marking',(cx-.20,yy-.209,base+.38),(.17,.002,.079),.002)
                    for i in range(5):
                        b.box('Graphite powder coat',(cx-.260+i*.026,yy-.211,base+.38),(.009,.001,.055),.0003)
    # Blank identifying plaques intentionally avoid invented capacities or safety certification.
    b.box('Metallic blue',(-.78,-.578,2.13),(.40,.011,.070),.004)
    for i in range(3):
        b.box('White marking',(-.92+i*.11,-.585,2.13),(.078,.003,.020),.002)
    return b.finish((4.0,-5.3,3.6),(0,0,1.48),4.60,[
        'Four slotted open-channel uprights with anchored base plates and guards',
        'Three beam levels with bolted end connectors and five cross supports each',
        'Alternating side diagonal braces and rear fall restraint structure',
        'Six fork-entry pallets with molded blocks and separate deck boards',
        'Four ribbed returnable bins and four strapped upper cases with blank asset labels'])

RESULTS=[conveyor(),amr(),pallet_rack()]
print(json.dumps({'generated':[m['id'] for m in RESULTS],'source':str(Path(__file__).resolve())}))
