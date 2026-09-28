"""Original detailed CNC and machine-vision equipment, meters / XY floor / Z up.

Run through Blender MCP. Creates two isolated scenes without altering existing scenes.
This is visualization geometry, not manufacturer CAD or engineering validation.
"""
import bpy
import io_scene_gltf2
import json
import math
from pathlib import Path
from collections import defaultdict
from mathutils import Vector, Euler

WEB = Path(__file__).resolve().parents[3]
OUT_ROOT = WEB / 'public' / 'models' / 'equipment'
RESULTS = []


class Model:
    def __init__(self, ident, name, dimensions):
        self.ident = ident
        self.name = name
        self.dimensions = dimensions
        self.scene = bpy.data.scenes.new('RS_EQUIPMENT_' + ident.upper().replace('-', '_'))
        bpy.context.window.scene = self.scene
        self.collection = bpy.data.collections.new(ident + '_ASSET')
        self.studio = bpy.data.collections.new(ident + '_STUDIO')
        self.scene.collection.children.link(self.collection)
        self.scene.collection.children.link(self.studio)
        self.buffers = defaultdict(lambda: [[], [], []])
        self.materials = {}
        self.material('white', (.70, .73, .77), .30, .29)
        self.material('silver', (.43, .47, .53), .85, .25)
        self.material('bright', (.70, .74, .80), .94, .19)
        self.material('graphite', (.055, .067, .085), .62, .31)
        self.material('rubber', (.012, .016, .023), .08, .64)
        self.material('blue', (.015, .085, .50), .72, .24)
        self.material('screen', (.012, .022, .040), .28, .16)
        self.material('light', (.70, .79, 1.0), .15, .25, emission=1.4)
        self.material('glass', (.29, .39, .51), .15, .12, alpha=.15)

    def material(self, name, color, metal, rough, alpha=1, emission=0):
        mat = bpy.data.materials.new(self.ident + '_' + name)
        mat.diffuse_color = (*color, alpha)
        mat.use_nodes = True
        bs = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        bs.inputs['Base Color'].default_value = (*color, alpha)
        bs.inputs['Metallic'].default_value = metal
        bs.inputs['Roughness'].default_value = rough
        bs.inputs['Alpha'].default_value = alpha
        if emission:
            bs.inputs['Emission Color'].default_value = (*color, 1)
            bs.inputs['Emission Strength'].default_value = emission
        if alpha < 1:
            if hasattr(mat, 'surface_render_method'):
                modes = {e.identifier for e in mat.bl_rna.properties['surface_render_method'].enum_items}
                if 'DITHERED' in modes:
                    mat.surface_render_method = 'DITHERED'
            mat.use_backface_culling = False
        self.materials[name] = mat

    def geometry(self, material, vertices, faces, smooth=False):
        buf = self.buffers[material]
        start = len(buf[0])
        buf[0].extend(vertices)
        buf[1].extend([tuple(start + i for i in face) for face in faces])
        buf[2].extend([smooth] * len(faces))

    def box(self, material, center, size, bevel=.004, rotation=None):
        x, y, z = [v / 2 for v in size]
        r = max(.00005, min(bevel, x * .70, y * .70, z * .70))
        ring = [(-x+r,-y),(x-r,-y),(x,-y+r),(x,y-r),(x-r,y),(-x+r,y),(-x,y-r),(-x,-y+r)]
        vertices = []
        q = Euler(rotation).to_quaternion() if rotation else None
        for zz, taper in [(-z, .3), (-z+r, 0), (z-r, 0), (z, .3)]:
            for xx, yy in ring:
                v = Vector((xx-math.copysign(r*taper,xx), yy-math.copysign(r*taper,yy), zz))
                if q:
                    v = q @ v
                vertices.append(tuple(Vector(center) + v))
        faces = [tuple(reversed(range(8))), tuple(range(24,32))]
        for k in range(3):
            faces.extend([(k*8+i,k*8+(i+1)%8,(k+1)*8+(i+1)%8,(k+1)*8+i) for i in range(8)])
        self.geometry(material, vertices, faces)

    def cyl(self, material, a, b, radius, sides=24, radius2=None):
        a, b = Vector(a), Vector(b)
        q = (b-a).to_track_quat('Z','Y')
        r2 = radius if radius2 is None else radius2
        vertices = [tuple(p+q@Vector((r*math.cos(i*2*math.pi/sides),r*math.sin(i*2*math.pi/sides),0)))
                    for p,r in [(a,radius),(b,r2)] for i in range(sides)]
        faces = [tuple(reversed(range(sides))),tuple(range(sides,2*sides))]
        faces.extend([(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)])
        self.geometry(material,vertices,faces,True)

    def ring(self, material, center, axis, radius, tube, n=32, s=6):
        p, q = Vector(center), Vector(axis).to_track_quat('Z','Y')
        vertices=[]
        for i in range(n):
            a=i*2*math.pi/n
            for j in range(s):
                b=j*2*math.pi/s
                rr=radius+tube*math.cos(b)
                vertices.append(tuple(p+q@Vector((rr*math.cos(a),rr*math.sin(a),tube*math.sin(b)))))
        faces=[(i*s+j,((i+1)%n)*s+j,((i+1)%n)*s+(j+1)%s,i*s+(j+1)%s) for i in range(n) for j in range(s)]
        self.geometry(material,vertices,faces,True)

    def bolt(self, center, axis=(0,0,1), radius=.007):
        p,v=Vector(center),Vector(axis).normalized()
        self.cyl('bright',p,p+v*.005,radius,8)
        self.cyl('rubber',p+v*.0051,p+v*.0054,radius*.45,6)

    def hose(self, points, radius=.012, material='rubber'):
        for a,b in zip(points,points[1:]):
            self.cyl(material,a,b,radius,10)

    def text(self, text, center, height=.05, material='white', align='LEFT'):
        curve=bpy.data.curves.new(self.ident+'_label','FONT')
        curve.body=text
        curve.size=height
        curve.extrude=.0004
        curve.resolution_u=2
        curve.align_x=align
        ob=bpy.data.objects.new(self.ident+'_label',curve)
        self.collection.objects.link(ob)
        ob.location=center
        ob.rotation_euler=(math.pi/2,0,0)
        bpy.context.view_layer.update()
        evaluated=ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh=evaluated.to_mesh()
        self.geometry(material,[tuple(ob.matrix_world@v.co) for v in mesh.vertices], [tuple(p.vertices) for p in mesh.polygons])
        evaluated.to_mesh_clear()
        bpy.data.objects.remove(ob,do_unlink=True)
        bpy.data.curves.remove(curve)

    def extrusion(self, a, b, width=.055):
        a,b=Vector(a),Vector(b)
        d=b-a
        q=d.to_track_quat('Z','Y')
        mid=(a+b)*.5
        self.box('silver',mid,(width,width,d.length),.002,q.to_euler())
        for axis in range(2):
            for sign in (-1,1):
                local=Vector((0,0,0))
                local[axis]=sign*(width/2+.0005)
                size=[width*.13,width*.13,d.length-.006]
                size[axis]=.0017
                self.box('rubber',mid+q@local,size,.0002,q.to_euler())

    def export(self, description, camera, target, lens=54):
        out=OUT_ROOT/self.ident
        out.mkdir(parents=True,exist_ok=True)
        # Fasteners and control knobs remain inside the advertised planning footprint.
        all_vertices=[v for buf in self.buffers.values() for v in buf[0]]
        scale=[min(1,(self.dimensions[i]/2-.001)/max(abs(v[i]) for v in all_vertices)) for i in (0,1)]
        for buf in self.buffers.values():
            buf[0]=[(v[0]*scale[0],v[1]*scale[1],v[2]) for v in buf[0]]
        all_vertices=[v for buf in self.buffers.values() for v in buf[0]]
        bounds={'min':[min(v[i] for v in all_vertices) for i in range(3)],'max':[max(v[i] for v in all_vertices) for i in range(3)]}
        assert bounds['min'][2] >= -.0001
        assert bounds['max'][2] <= self.dimensions[2]+.0001
        root=bpy.data.objects.new(self.ident+'_ROOT',None)
        root['asset_id']=self.ident
        self.collection.objects.link(root)
        triangles=0
        meshes=0
        for material,(verts,faces,smooth) in self.buffers.items():
            mesh=bpy.data.meshes.new(self.ident+'_'+material)
            mesh.from_pydata(verts,[],faces)
            mesh.materials.append(self.materials[material])
            mesh.update()
            for p,s in zip(mesh.polygons,smooth):
                p.use_smooth=s
            ob=bpy.data.objects.new(mesh.name,mesh)
            ob['asset_id']=self.ident
            ob['equipment_id']=self.ident
            self.collection.objects.link(ob)
            ob.parent=root
            mesh.calc_loop_triangles()
            triangles+=len(mesh.loop_triangles)
            meshes+=1
        assert meshes < 25, meshes
        assert triangles < 42000, triangles
        bpy.context.view_layer.update()
        for ob in self.scene.objects:
            ob.select_set(False)
        for ob in self.collection.objects:
            ob.select_set(True)
        formats={item[0] for item in io_scene_gltf2.get_format_items(None,bpy.context)}
        assert 'GLB' in formats
        bpy.ops.export_scene.gltf(filepath=str(out/'asset.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_extras=True,export_apply=True)
        self.material('studio',(.028,.034,.044),.2,.48)
        mesh=bpy.data.meshes.new(self.ident+'_floor')
        mesh.from_pydata([(-100,-100,-.009),(100,-100,-.009),(100,100,-.009),(-100,100,-.009)],[],[(0,1,2,3)])
        mesh.materials.append(self.materials['studio'])
        ob=bpy.data.objects.new(self.ident+'_floor',mesh)
        self.studio.objects.link(ob)
        world=bpy.data.worlds.new(self.ident+'_world')
        world.use_nodes=True
        bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
        bg.inputs['Color'].default_value=(.06,.075,.10,1)
        bg.inputs['Strength'].default_value=.50
        self.scene.world=world
        for name,pos,power,size in [('key',(3,-4,6),1550,5),('rim',(-3,3,5),1800,4),('fill',(-4,-3,3),850,3)]:
            light=bpy.data.lights.new(self.ident+'_'+name,'AREA')
            light.energy=power
            light.size=size
            light.shape='DISK' if 'DISK' in {e.identifier for e in light.bl_rna.properties['shape'].enum_items} else 'SQUARE'
            ob=bpy.data.objects.new(light.name,light)
            self.studio.objects.link(ob)
            ob.location=pos
            ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
        camdata=bpy.data.cameras.new(self.ident+'_camera')
        cameraob=bpy.data.objects.new(camdata.name,camdata)
        self.studio.objects.link(cameraob)
        cameraob.location=camera
        cameraob.rotation_euler=(Vector(target)-cameraob.location).to_track_quat('-Z','Y').to_euler()
        camdata.lens=lens
        camdata.type='PERSP'
        self.scene.camera=cameraob
        try:
            self.scene.render.engine='BLENDER_EEVEE'
        except TypeError:
            pass
        self.scene.render.resolution_x=1200
        self.scene.render.resolution_y=1000
        self.scene.render.resolution_percentage=100
        self.scene.render.image_settings.file_format='PNG'
        self.scene.render.filepath=str(out/'thumbnail.png')
        self.scene.render.film_transparent=False
        self.scene['asset_id']=self.ident
        self.scene['model_note']='Original concept equipment. Visual planning model, not engineering CAD.'
        bpy.data.libraries.write(str(out/'scene.blend'),{self.scene},fake_user=True,compress=True)
        bpy.ops.render.render(write_still=True)
        manifest={'id':self.ident,'name':self.name,'description':description,'dimensions':{'width':self.dimensions[0],'depth':self.dimensions[1],'height':self.dimensions[2]},'units':'meters','coordinateSystem':'Blender XY floor / Z up; glTF Y up','origin':'Ground plane at footprint center','source':'Original procedural visualization; no manufacturer CAD used','geometry':{'meshes':meshes,'triangles':triangles,'bounds':bounds},'materials':'Neutral metal, white enamel, graphite and restrained metallic blue','features':description.split('; '),'files':{'model':'asset.glb','editable':'scene.blend','thumbnail':'thumbnail.png'}}
        (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
        RESULTS.append({'id':self.ident,'meshes':meshes,'triangles':triangles,'out':str(out)})


def build_cnc():
    m=Model('cnc-mill','CNC 머시닝 센터',(2.4,2.2,2.6))
    # Separate levelers, cast machine bed and folded sheet-metal plinth.
    for x in (-.99,.99):
        for y in (-.83,.83):
            m.cyl('rubber',(x,y,0),(x,y,.035),.095,24)
            m.cyl('bright',(x,y,.035),(x,y,.105),.035,16)
            m.cyl('graphite',(x,y,.08),(x,y,.14),.064,16)
    m.box('graphite',(0,.04,.30),(2.26,1.98,.40),.065)
    m.box('white',(-.19,.035,.545),(1.96,1.94,.22),.026)
    m.box('rubber',(-.19,-.943,.57),(1.90,.012,.14),.006)
    # Back/right enclosure. The front door is partly open, exposing milling hardware.
    m.box('white',(-.18,.996,1.545),(1.99,.11,1.99),.018)
    m.box('white',(-1.125,.04,1.565),(.11,1.90,2.03),.021)
    m.box('white',(.748,.49,1.565),(.11,1.01,2.03),.018)
    m.box('white',(-.18,.04,2.50),(1.99,1.95,.12),.018)
    m.box('graphite',(-.18,-.95,2.45),(1.96,.13,.20),.012)
    m.box('blue',(-.18,-1.018,2.445),(1.76,.005,.024),.001)
    m.text('RS  /  CNC 240',(-.97,-1.025,2.472),.061)
    # Fixed side louvres, small service panels, exposed fastening pattern.
    m.box('graphite',(-1.185,.24,1.41),(.018,.76,.65),.008)
    for z in [1.15+i*.053 for i in range(11)]:
        m.box('silver',(-1.197,.24,z),(.009,.67,.014),.002)
    for y in (-.78,.77):
        for z in (.80,1.5,2.30):
            m.bolt((-1.183,y,z),(-1,0,0),.008)
    # Door storage panel and sliding door: white perimeter + smoked glass.
    # Four actual perimeter pieces leave a real opening behind the window.
    m.box('white',(-.78,-.959,2.220),(.60,.115,.26),.018)
    m.box('white',(-.78,-.959,.864),(.60,.115,.468),.018)
    m.box('white',(-1.045,-.959,1.59),(.07,.115,.99),.012)
    m.box('white',(-.548,-.959,1.59),(.136,.115,.99),.012)
    for x in (-.988,-.602):
        m.box('graphite',(x,-1.025,1.59),(.025,.025,1.10),.005)
    for z in (1.053,2.127):
        m.box('graphite',(-.795,-1.025,z),(.41,.025,.026),.005)
    m.box('glass',(-.795,-1.041,1.59),(.355,.007,.98),.008)
    for x in (-1.00,-.59):
        m.box('silver',(x,-1.055,1.59),(.017,.012,1.08),.003)
    m.box('rubber',(-.533,-1.044,1.48),(.022,.058,.44),.012)
    for z in (1.28,1.68):
        m.cyl('bright',(-.533,-1.019,z),(-.533,-1.085,z),.017,16)
    m.box('bright',(-.533,-1.096,1.48),(.026,.023,.405),.011)
    for z in (.677,2.355):
        m.box('silver',(-.18,-.941,z),(1.82,.064,.037),.004)
        m.box('rubber',(-.18,-.976,z),(1.78,.008,.010),.002)
    # Interior splash liners, telescopic way covers, X/Y guide rails and T-slot table.
    m.box('silver',(-.15,.28,.69),(1.51,1.26,.08),.012)
    m.box('graphite',(-.13,.27,.77),(1.19,.99,.08),.008)
    for y in (-.04,.53):
        m.box('bright',(-.13,y,.816),(1.28,.055,.035),.004)
    for x in [-.72+i*.115 for i in range(11)]:
        m.box('silver',(x,.27,.839),(.110,.97,.021),.004)
    m.box('graphite',(-.04,.03,.93),(.94,.61,.18),.018)
    m.box('bright',(-.04,.03,1.035),(1.13,.62,.04),.012)
    for y in (-.195,-.082,.031,.144,.257):
        m.box('rubber',(-.04,y,1.058),(1.07,.014,.007),.001)
    # Two vises holding a machined part, exact jaw and socket features.
    for x in (-.35,.28):
        m.box('graphite',(x,.01,1.09),(.235,.33,.06),.007)
        for y in (-.12,.14):
            m.box('silver',(x,y,1.158),(.23,.065,.077),.004)
            for xx in (x-.072,x+.072):
                m.bolt((xx,y,1.202),radius=.008)
        m.cyl('bright',(x,-.193,1.11),(x,-.255,1.11),.022,20)
        m.cyl('silver',(x-.07,-.258,1.11),(x+.07,-.258,1.11),.008,12)
    m.box('white',(-.035,.023,1.184),(.67,.137,.09),.010)
    for x in (-.28,-.115,.05,.215):
        m.cyl('graphite',(x,.02,1.229),(x,.02,1.231),.034,24)
        m.cyl('silver',(x,.02,1.231),(x,.02,1.234),.023,24)
    # Vertical spindle column, square spindle motor and visible rotating tool holder.
    m.box('graphite',(.25,.747,1.57),(.57,.26,1.63),.020)
    for x in (.06,.44):
        m.box('bright',(x,.599,1.62),(.058,.042,1.55),.004)
    for z in [1.0+i*.09 for i in range(15)]:
        m.box('rubber',(.25,.571,z),(.33,.033,.014),.003)
    m.box('white',(.25,.335,1.98),(.58,.56,.68),.055)
    m.box('graphite',(.25,.029,2.08),(.43,.065,.26),.018)
    for x in [.07+i*.06 for i in range(7)]:
        m.box('silver',(x,-.009,2.08),(.015,.006,.18),.002)
    m.cyl('graphite',(.25,.28,1.67),(.25,.28,1.50),.132,40)
    m.cyl('bright',(.25,.28,1.50),(.25,.28,1.43),.098,40,radius2=.061)
    m.cyl('silver',(.25,.28,1.43),(.25,.28,1.38),.061,32)
    m.cyl('graphite',(.25,.28,1.38),(.25,.28,1.34),.041,24)
    m.cyl('bright',(.25,.28,1.34),(.25,.28,1.245),.016,16)
    for i in range(5):
        a=i*math.pi*2/5
        m.cyl('graphite',(.25+.014*math.cos(a),.28+.014*math.sin(a),1.247),(.25+.012*math.cos(a+.6),.28+.012*math.sin(a+.6),1.314),.003,6)
    # Segmented coolant nozzles with metallic blue collars.
    for side in (-1,1):
        pts=[(.25+side*.20,.13,1.72),(.25+side*.22,.10,1.58),(.25+side*.16,.08,1.47),(.25+side*.09,.15,1.39)]
        m.hose(pts,.022,'blue')
        for point in pts[:-1]:
            m.ring('graphite',point,(0,0,1),.022,.004,16,5)
        m.cyl('bright',pts[-2],pts[-1],.018,16,radius2=.010)
    # Eight-position tool carousel visible inside the side of the chamber.
    m.cyl('graphite',(-.70,.57,1.67),(-.70,.57,1.755),.29,48)
    m.cyl('bright',(-.70,.57,1.756),(-.70,.57,1.777),.077,24)
    for i in range(8):
        a=i*math.pi/4
        x,y=-.70+.235*math.cos(a),.57+.235*math.sin(a)
        m.cyl('silver',(x,y,1.66),(x,y,1.58),.031,20,radius2=.018)
        m.cyl('bright',(x,y,1.58),(x,y,1.49),.009,12)
        m.bolt((x,y,1.758),radius=.008)
    # Internal light strip and coolant drain apertures.
    m.box('graphite',(-.20,.31,2.39),(.88,.09,.044),.008)
    m.box('light',(-.20,.31,2.363),(.79,.054,.010),.004)
    for x in [-.72+i*.085 for i in range(17)]:
        m.box('rubber',(x,-.49,.689),(.038,.22,.006),.003)
    # Right-side controller column, display, keys, selector and jog handwheel.
    m.box('white',(.963,-.005,1.35),(.39,1.92,2.02),.026)
    m.box('graphite',(.966,-.991,1.67),(.37,.13,1.13),.026)
    m.box('silver',(.966,-1.063,1.88),(.324,.018,.40),.012)
    m.box('screen',(.966,-1.076,1.88),(.280,.008,.347),.010)
    m.text('CNC 240',(.858,-1.082,1.997),.037,'light')
    for row,width in enumerate((.18,.21,.14,.19,.10)):
        m.box('blue',(.955,-1.082,1.933-row*.038),(width,.0018,.008),.001)
    for x in [.859+i*.041 for i in range(6)]:
        for z in [1.545+i*.041 for i in range(3)]:
            m.box('silver',(x,-1.070,z),(.027,.011,.027),.004)
    for x in (.87,.964,1.058):
        m.cyl('bright',(x,-1.070,1.417),(x,-1.080,1.417),.031,20)
        m.cyl('blue' if x==1.058 else 'rubber',(x,-1.080,1.417),(x,-1.095,1.417),.023,20)
    m.cyl('silver',(.966,-1.072,1.25),(.966,-1.097,1.25),.065,32)
    m.cyl('graphite',(.966,-1.097,1.25),(.966,-1.113,1.25),.053,32)
    m.cyl('bright',(.991,-1.113,1.278),(.991,-1.128,1.278),.012,16)
    m.text('JOG',(.882,-1.080,1.147),.030)
    # Low chip conveyor, side access door, identification plate, cable carrier.
    m.box('graphite',(.963,-.15,.42),(.33,1.51,.13),.02)
    for y in [-.78+i*.12 for i in range(12)]:
        m.box('silver',(.963,y,.491),(.30,.014,.025),.002)
    for y in (-.62,.70):
        for z in (.89,2.20):
            m.bolt((1.165,y,z),(1,0,0),.008)
    m.box('silver',(.967,-.995,.89),(.25,.014,.16),.007)
    m.text('240 / 3 AXIS',(.854,-1.006,.882),.025,'graphite')
    m.hose([(.54,.59,2.2),(.64,.57,2.36),(.66,.27,2.39),(.65,.02,2.20),(.59,.01,2.04)],.027)
    for z in (1.98,2.08,2.18):
        m.box('graphite',(.79,.67,z),(.1,.24,.055),.006)
    m.export('Partly open sliding safety door with transparent window; enclosed milling table with T slots and two vises; detailed vertical spindle and tool; eight-position tool carousel; segmented coolant lines; telescopic way covers; operator display and jog controls; internal lighting; chip conveyor and leveling feet',(4.4,-5.8,3.9),(0,-.05,1.19),52)


def build_vision():
    m=Model('vision-station','비전 검사 스테이션',(1.4,1.1,2.1))
    # Four adjustable feet, braced extrusion frame and cross beams.
    for x in (-.605,.605):
        for y in (-.44,.44):
            m.cyl('rubber',(x,y,0),(x,y,.028),.053,24)
            m.cyl('bright',(x,y,.028),(x,y,.096),.013,16)
            m.cyl('silver',(x,y,.088),(x,y,.108),.025,12)
            m.extrusion((x,y,.107),(x,y,2.032),.058)
    for z in (.20,.80,1.99):
        for y in (-.44,.44):
            m.extrusion((-.605,y,z),(.605,y,z),.058)
        for x in (-.605,.605):
            m.extrusion((x,-.44,z),(x,.44,z),.058)
    # Corner gussets, flange screw sets and front opening with rigid top lintel.
    for x in (-.605,.605):
        for y in (-.44,.44):
            for z in (.20,.80,1.99):
                m.box('silver',(x,y-.034,z-.050),(.084,.018,.11),.007)
                m.bolt((x,y-.047,z-.078),(0,-1,0),.007)
                m.bolt((x,y-.047,z-.023),(0,-1,0),.007)
    # Clear side guards with perimeter seals, small clamps and independent hinged rear panel.
    for x in (-.605,.605):
        m.box('glass',(x,0,1.43),(.007,.79,1.06),.006)
        for y in (-.345,.345):
            for z in (.98,1.88):
                m.box('graphite',(x,y,z),(.021,.046,.046),.005)
                m.bolt((x+math.copysign(.013,x),y,z),(math.copysign(1,x),0,0),.007)
    m.box('glass',(0,.441,1.43),(1.14,.007,1.06),.006)
    for x in (-.44,.44):
        m.box('graphite',(x,.449,1.43),(.032,.018,.41),.007)
    # Belt transfer line with drive drums, side cheeks, guide rails and supports.
    m.box('graphite',(0,-.03,.915),(1.36,.60,.116),.014)
    m.box('rubber',(0,-.03,.984),(1.18,.49,.022),.013)
    for x in (-.615,.615):
        m.cyl('bright',(x,-.286,.965),(x,.226,.965),.051,32)
        m.cyl('graphite',(x,-.318,.965),(x,-.286,.965),.032,24)
        m.cyl('graphite',(x,.226,.965),(x,.270,.965),.032,24)
    for y in (-.331,.271):
        m.box('silver',(0,y,.972),(1.32,.038,.095),.008)
        m.box('bright',(0,y,1.026),(1.25,.024,.019),.003)
        for x in (-.54,-.30,.0,.30,.54):
            m.bolt((x,y,.996),(0,-1 if y<0 else 1,0),.006)
    m.box('graphite',(.502,.367,.908),(.22,.14,.15),.023)
    m.cyl('silver',(.502,.274,.908),(.502,.451,.908),.065,28)
    for y in [.29+i*.025 for i in range(6)]:
        m.ring('graphite',(.502,y,.908),(0,1,0),.066,.003,24,5)
    # Replaceable carrier trays, machined precision parts and inspection datum sockets.
    for x in (-.40,0,.40):
        m.box('blue',(x,-.03,1.02),(.29,.35,.027),.016)
        m.box('graphite',(x,-.03,1.037),(.264,.324,.014),.009)
        m.box('silver',(x,-.03,1.06),(.187,.214,.040),.014)
        for xx in (-.058,.058):
            for yy in (-.066,.066):
                m.cyl('rubber',(x+xx,-.03+yy,1.081),(x+xx,-.03+yy,1.084),.016,16)
        m.box('white',(x,-.03,1.088),(.061,.113,.014),.006)
        for yy in (-.137,.137):
            for xx in (-.102,.102):
                m.bolt((x+xx,-.03+yy,1.047),radius=.004)
    # Top precision camera rail and sliding camera plates.
    m.extrusion((-.565,-.08,1.84),(.565,-.08,1.84),.085)
    m.extrusion((0,-.37,1.93),(0,.37,1.93),.060)
    for x in (-.25,.25):
        m.box('graphite',(x,-.102,1.84),(.154,.116,.12),.008)
        m.box('silver',(x,-.137,1.714),(.129,.024,.22),.006)
        for xx in (x-.043,x+.043):
            for z in (1.642,1.786):
                m.bolt((xx,-.154,z),(0,-1,0),.005)
        m.box('blue',(x,-.08,1.676),(.119,.119,.15),.011)
        m.box('graphite',(x,-.08,1.747),(.125,.126,.021),.006)
        for xx in (x-.066,x+.066):
            for z in [1.624+i*.022 for i in range(5)]:
                m.box('silver',(xx,-.08,z),(.009,.11,.006),.001)
        m.cyl('silver',(x,-.08,1.601),(x,-.08,1.579),.043,32)
        m.cyl('graphite',(x,-.08,1.579),(x,-.08,1.523),.038,32)
        for z in (1.541,1.555,1.57):
            m.ring('silver',(x,-.08,z),(0,0,1),.037,.002,28,5)
        m.cyl('screen',(x,-.08,1.522),(x,-.08,1.518),.028,32)
        m.ring('graphite',(x,-.08,1.499),(0,0,1),.086,.018,40,8)
        m.ring('light',(x,-.08,1.486),(0,0,1),.083,.008,40,6)
        for xx in (x-.088,x+.088):
            m.cyl('silver',(xx,-.08,1.50),(xx,-.08,1.619),.006,12)
        m.hose([(x,-.078,1.762),(x,-.078,1.88),(x+.075,.08,1.902),(.48,.17,1.902),(.542,.30,1.80),(.542,.30,1.16)],.012)
        m.cyl('bright',(x,-.08,1.763),(x,-.08,1.786),.015,16)
    # Cross lighting bar and camera controller with side cooling fins.
    m.box('graphite',(0,.269,1.54),(.95,.082,.070),.010)
    m.box('light',(0,.24,1.512),(.87,.035,.022),.004)
    for x in (-.44,.44):
        m.extrusion((x,.34,1.53),(x,.34,1.93),.027)
    m.box('silver',(.38,.36,1.31),(.27,.11,.23),.012)
    for x in [.267+i*.03 for i in range(9)]:
        m.box('graphite',(x,.297,1.31),(.008,.012,.20),.001)
    for x in (.31,.37,.43):
        m.cyl('blue',(x,.355,1.424),(x,.355,1.446),.011,14)
    # Lower control cabinet, twin doors, filtered fan and operator screen.
    m.box('white',(0,.055,.493),(1.02,.67,.505),.023)
    m.box('graphite',(0,-.290,.493),(.99,.016,.47),.012)
    for x in (-.25,.25):
        m.box('white',(x,-.303,.493),(.47,.014,.445),.009)
        m.box('graphite',(x+(.155 if x<0 else -.155),-.318,.50),(.018,.024,.12),.006)
        for xx in (x-.192,x+.192):
            for z in (.317,.673):
                m.bolt((xx,-.317,z),(0,-1,0),.005)
    for z in [.365+i*.032 for i in range(7)]:
        m.box('rubber',(.275,-.314,z),(.19,.004,.011),.003)
    m.box('silver',(-.346,-.319,.36),(.18,.008,.080),.003)
    m.text('RS / VISION',(-.427,-.325,.36),.018,'graphite')
    m.box('graphite',(.405,-.456,1.57),(.286,.091,.32),.021)
    m.box('screen',(.405,-.507,1.594),(.237,.010,.207),.008)
    m.text('VISION',(.310,-.515,1.65),.032,'light')
    for row,width in enumerate((.15,.18,.11)):
        m.box('blue',(.398,-.515,1.60-row*.035),(width,.003,.008),.001)
    for x in (.335,.405,.475):
        m.cyl('silver',(x,-.507,1.461),(x,-.521,1.461),.021,20)
        m.cyl('blue' if x==.475 else 'rubber',(x,-.521,1.461),(x,-.529,1.461),.014,20)
    # Guard interlock, photoelectric inlet sensors, energy chains and cable routing.
    for x in (-.565,.565):
        m.box('blue',(x,-.344,1.11),(.052,.050,.044),.008)
        m.cyl('bright',(x,-.372,1.11),(x,-.380,1.11),.017,20)
        m.cyl('screen',(x,-.380,1.11),(x,-.382,1.11),.011,20)
        m.hose([(x,-.34,1.095),(x,-.34,.81),(x,-.12,.77),(x*.55,-.12,.749)],.008)
    m.box('graphite',(-.567,-.45,1.79),(.051,.040,.12),.007)
    m.box('silver',(-.535,-.46,1.795),(.011,.055,.065),.004)
    for z in [1.13+i*.043 for i in range(15)]:
        m.box('graphite',(.57,.357,z),(.040,.068,.033),.005)
    m.box('white',(0,-.479,1.989),(1.00,.026,.084),.006)
    m.text('RS   VISION INSPECTION',(-.419,-.495,1.969),.052,'graphite')
    m.box('blue',(0,-.497,1.948),(.77,.003,.008),.001)
    m.export('Slotted aluminum gantry with fastened gussets; transparent side and rear safety panels; twin downward cameras with lens barrels and luminous ring lights; belt transfer with servo drive; three detailed fixture trays; overhead illumination and camera controller; electronic cabinet; local inspection display; photoelectric sensors and routed cables',(2.9,-3.9,2.80),(0,0,1.01),54)


build_cnc()
build_vision()
print(json.dumps({'equipment_group_b':RESULTS},ensure_ascii=False))
