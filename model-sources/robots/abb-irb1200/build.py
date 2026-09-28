"""Original photo-reference ABB IRB 1200-5/0.9 visualization; not OEM CAD.
Executed through Blender MCP by the root agent. No existing scenes are removed.
Meters, Blender XY ground / Z up. All rig rest world rotations are identity.
"""
import bpy, math, json, os
from pathlib import Path
from mathutils import Vector, Matrix
from collections import defaultdict
import io_scene_gltf2
OUT=str(Path(__file__).resolve().parents[3]/'public/models/robots/abb-irb1200')
SOURCE=str(Path(__file__).resolve().parent)
os.makedirs(OUT,exist_ok=True)
manifest=json.load(open(os.path.join(SOURCE,'manifest.json')))
scene=bpy.data.scenes.new('RS_ABB_IRB1200_5_90_PHOTO_REFERENCE')
bpy.context.window.scene=scene
robotcol=bpy.data.collections.new('ABB_IRB1200_ARTICULATED_MODEL'); scene.collection.children.link(robotcol)
studio=bpy.data.collections.new('ABB_IRB1200_STUDIO'); scene.collection.children.link(studio)
M={}
def mat(name,color,metal=0,rough=.4):
    m=bpy.data.materials.new('ABB1200_'+name); m.diffuse_color=(*color,1);m.use_nodes=True
    bs=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough
    M[name]=m
mat('ceramic_white',(.79,.805,.82),.20,.28)
mat('service_cover',(.65,.674,.70),.27,.3)
mat('machined_alloy',(.53,.56,.60),.85,.22)
mat('dark_alloy',(.065,.078,.095),.7,.31)
mat('gasket',(.013,.017,.024),0,.7)
mat('socket',(.022,.029,.040),.4,.45)
mat('blue',(.012,.17,.68),.72,.25)
B=defaultdict(lambda:[[],[],[]])
def geom(g,m,vs,fs,smooth=False):
    b=B[(g,m)];n=len(b[0]);b[0].extend(vs);b[1].extend([tuple(n+i for i in f) for f in fs]);b[2].extend([smooth]*len(fs))
def cyl(g,m,a,b,r,n=32,r2=None):
    a,b=Vector(a),Vector(b);q=(b-a).to_track_quat('Z','Y');rr=r if r2 is None else r2
    vs=[tuple(p+q@Vector((rad*math.cos(i*2*math.pi/n),rad*math.sin(i*2*math.pi/n),0))) for p,rad in [(a,r),(b,rr)] for i in range(n)]
    fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    geom(g,m,vs,fs,True)
def box(g,m,p,s,bevel=.004,quat=None):
    x,y,z=[v/2 for v in s];r=min(bevel,x*.8,y*.8,z*.8)
    ring=[(-x+r,-y),(x-r,-y),(x,-y+r),(x,y-r),(x-r,y),(-x+r,y),(-x,y-r),(-x,-y+r)]
    vs=[]
    for zz,taper in [(-z,.30),(-z+r,0),(z-r,0),(z,.30)]:
        for xx,yy in ring: vs.append(Vector((xx-math.copysign(r*taper,xx),yy-math.copysign(r*taper,yy),zz)))
    if quat:vs=[quat@v for v in vs]
    vs=[tuple(Vector(p)+v) for v in vs]
    fs=[tuple(reversed(range(8))),tuple(range(24,32))]
    for k in range(3):fs +=[(k*8+i,k*8+(i+1)%8,(k+1)*8+(i+1)%8,(k+1)*8+i) for i in range(8)]
    geom(g,m,vs,fs)
def loft(g,m,a,b,radii,n=40):
    # Curved cast section, elliptical in the local XY plane; all detailed in mesh.
    a,b=Vector(a),Vector(b);q=(b-a).to_track_quat('Z','Y');vs=[]
    for t,rx,ry in radii:
        p=a.lerp(b,t)
        for i in range(n):
            th=i*2*math.pi/n
            vs.append(tuple(p+q@Vector((rx*math.cos(th),ry*math.sin(th),0))))
    fs=[tuple(reversed(range(n))),tuple(range((len(radii)-1)*n,len(radii)*n))]
    for k in range(len(radii)-1):fs +=[(k*n+i,k*n+(i+1)%n,(k+1)*n+(i+1)%n,(k+1)*n+i) for i in range(n)]
    geom(g,m,vs,fs,True)
def hose(g,pts,r=.004,m='gasket'):
    for a,b in zip(pts,pts[1:]):cyl(g,m,a,b,r,12)
def torus(g,m,p,axis,major,minor,n=40,s=8):
    p=Vector(p);q=Vector(axis).to_track_quat('Z','Y');vs=[]
    for i in range(n):
        a=i*2*math.pi/n
        for j in range(s):
            b=j*2*math.pi/s;rr=major+minor*math.cos(b)
            vs.append(tuple(p+q@Vector((rr*math.cos(a),rr*math.sin(a),minor*math.sin(b)))))
    fs=[(i*s+j,((i+1)%n)*s+j,((i+1)%n)*s+(j+1)%s,i*s+(j+1)%s) for i in range(n) for j in range(s)]
    geom(g,m,vs,fs,True)
def bolt(g,p,axis=(0,0,1),r=.004,length=.0035):
    p=Vector(p);v=Vector(axis).normalized();cyl(g,'machined_alloy',p,p+v*length,r,12)
    cyl(g,'socket',p+v*(length+.0001),p+v*(length+.0004),r*.48,6)
def ring_bolts(g,p,axis,r,count=8,size=.003):
    p=Vector(p);v=Vector(axis).normalized();q=v.to_track_quat('Z','Y')
    for i in range(count):
        a=2*math.pi*i/count;bolt(g,p+q@Vector((r*math.cos(a),r*math.sin(a),0)),axis,size)
def cap(g,center,axis,r,length=.02,material='ceramic_white'):
    p=Vector(center);v=Vector(axis).normalized()
    cyl(g,'gasket',p-v*.002,p+v*.004,r*1.016,48)
    loft(g,material,p,p+v*length,[(0,r,r),(.25,r*1.025,r*1.025),(.8,r*.99,r*.99),(1,r*.85,r*.85)],48)
    ring_bolts(g,p+v*(length+.0003),v,r*.73,8,.0024)
# Static square flange and rounded fixed pedestal.
box(0,'machined_alloy',(0,0,.008),(.210,.210,.016),.013)
box(0,'ceramic_white',(0,0,.017),(.202,.202,.008),.014)
for x in [-.087,.087]:
    for y in [-.087,.087]:
        cyl(0,'dark_alloy',(x,y,.020),(x,y,.025),.009,24)
        bolt(0,(x,y,.025),r=.006,length=.005)
loft(0,'ceramic_white',(0,0,.025),(0,0,.224),[(0,.089,.091),(.1,.097,.098),(.86,.096,.097),(.98,.094,.095),(1,.088,.089)],64)
torus(0,'gasket',(0,0,.219),(0,0,1),.089,.0018,64)
# Rear controller interface with recessed multipole socket, ethernet and labels.
box(0,'service_cover',(-.093,0,.135),(.020,.088,.118),.007)
box(0,'gasket',(-.104,0,.149),(.007,.065,.062),.003)
for yy in [-.017,.018]:
    cyl(0,'machined_alloy',(-.109,yy,.15),(-.122,yy,.15),.010,24)
    cyl(0,'socket',(-.122,yy,.15),(-.123,yy,.15),.007,20)
    for i in range(5):
        a=i*2*math.pi/5;cyl(0,'machined_alloy',(-.1235,yy+.004*math.cos(a),.15+.004*math.sin(a)),(-.124,yy+.004*math.cos(a),.15+.004*math.sin(a)),.0007,6)
box(0,'socket',(-.107,0,.094),(.003,.04,.021),.002)
for yy in [-.036,.036]:
    for zz in [.085,.183]:bolt(0,(-.106,yy,zz),(-1,0,0),.003)
# J1 turret and tapered shoulder support. Base yaw bearing is independent.
cyl(1,'dark_alloy',(0,0,.222),(0,0,.235),.081,64)
cyl(1,'machined_alloy',(0,0,.232),(0,0,.242),.084,64)
loft(1,'ceramic_white',(0,0,.239),(0,0,.399),[(0,.081,.071),(.12,.088,.075),(.55,.074,.071),(.9,.058,.072),(1,.04,.05)],48)
# Shoulder axle shell through the support.
cyl(1,'ceramic_white',(0,-.064,.399),(0,.063,.399),.077,64)
cap(1,(0,-.064,.399),(0,-1,0),.068,.018)
# Narrow joint identification patch with blue accent.
box(1,'socket',(.062,-.025,.267),(.003,.044,.015),.001)
box(1,'blue',(.064,-.025,.267),(.001,.035,.005),.0005)
p2=Vector(manifest['joints'][1]['pivot']);p3=Vector(manifest['joints'][2]['pivot']);p5=Vector(manifest['joints'][4]['pivot'])
# J2 cast lower arm: bulged bearing rings, curved taper and bolted side cover.
cyl(2,'dark_alloy',(0,.062,.399),(0,.07,.399),.064,64)
cap(2,(0,.07,.399),(0,1,0),.071,.016)
a=p2+Vector((0,.012,0));b=p3+Vector((0,.012,0))
loft(2,'ceramic_white',a,b,[(0,.047,.058),(.07,.073,.064),(.24,.072,.056),(.46,.050,.047),(.76,.045,.052),(.92,.072,.068),(1,.066,.062)],48)
# Long, flat side service plate follows the cast silhouette.
side_a=p2.lerp(p3,.12)+Vector((0,-.064,0));side_b=p2.lerp(p3,.89)+Vector((0,-.064,0))
loft(2,'service_cover',side_a,side_b,[(0,.035,.006),(.08,.043,.009),(.32,.032,.011),(.8,.033,.01),(1,.041,.006)],40)
for t in [.13,.27,.52,.76,.88]:
    pos=p2.lerp(p3,t)+Vector((.029,-.073,0));bolt(2,pos,(0,-1,0),.0027)
# J3 elbow bearing, curved outer cast cap and forearm support.
cyl(3,'dark_alloy',p3+Vector((0,-.067,0)),p3+Vector((0,.074,0)),.066,64)
cap(3,p3+Vector((0,.074,0)),(0,1,0),.070,.022)
cap(3,p3+Vector((0,-.067,0)),(0,-1,0),.061,.014,'service_cover')
# Upper arm gearbox, taper between elbow and the coaxial J4 roll bearing.
loft(3,'ceramic_white',p3-Vector((.045,0,0)),p3+Vector((.14,0,0)),[(0,.047,.05),(.15,.075,.074),(.6,.068,.067),(.94,.050,.056),(1,.05,.055)],48)
for zz in [-.032,.032]:
    for xx in [.015,.085]:bolt(3,p3+Vector((xx,-.068,zz)),(0,-1,0),.0026)
# J4 forearm rolls about its own horizontal centerline.
j4=Vector(manifest['joints'][3]['pivot'])
cyl(4,'gasket',j4-Vector((.004,0,0)),j4+Vector((.008,0,0)),.055,48)
loft(4,'ceramic_white',j4,p5,[(0,.054,.053),(.1,.055,.052),(.32,.05,.049),(.76,.040,.043),(.92,.038,.046),(1,.030,.041)],48)
# Long panel seam and recessed service covers; internal air/system connectors.
for sy in [-1,1]:
    hose(4,[tuple(j4+Vector((.026,sy*.05,-.012))),tuple(p5+Vector((-.055,sy*.037,-.012)))],.0014)
    for xx in [.035,.128,.22]:bolt(4,j4+Vector((xx,sy*(.05-xx*.04),.015)),(0,sy,0),.0021)
box(4,'service_cover',tuple(j4+Vector((.13,-.047,.019))),(.118,.006,.029),.007)
for xx in [.094,.15]:bolt(4,j4+Vector((xx,-.051,.019)),(0,-1,0),.0022)
for xx in [.06,.11]:
    cyl(4,'machined_alloy',j4+Vector((xx,0,.052)),j4+Vector((xx,0,.063)),.009,20)
    cyl(4,'socket',j4+Vector((xx,0,.063)),j4+Vector((xx,0,.064)),.0055,16)
# J5 exposed wrist trunnion, split yoke and rotary end housing.
for yy in [-.035,.035]:
    loft(4,'ceramic_white',p5+Vector((-.054,yy,0)),p5+Vector((.005,yy,0)),[(0,.014,.027),(.5,.019,.029),(1,.015,.023)],32)
cyl(5,'dark_alloy',p5+Vector((0,-.04,0)),p5+Vector((0,.04,0)),.030,48)
cap(5,p5+Vector((0,-.04,0)),(0,-1,0),.029,.007,'service_cover')
cap(5,p5+Vector((0,.04,0)),(0,1,0),.029,.007)
p6=Vector(manifest['joints'][5]['pivot'])
loft(5,'ceramic_white',p5,p6,[(0,.029,.029),(.22,.036,.038),(.70,.033,.034),(1,.027,.027)],40)
# J6 mounting face, six socket screws, twin guide pneumatic parallel gripper.
cyl(6,'gasket',p6+Vector((0,0,.003)),p6-Vector((0,0,.004)),.029,48)
cyl(6,'machined_alloy',p6-Vector((0,0,.004)),p6-Vector((0,0,.014)),.0315,64)
ring_bolts(6,p6-Vector((0,0,.0144)),(0,0,-1),.025,6,.002)
cyl(6,'dark_alloy',p6-Vector((0,0,.014)),p6-Vector((0,0,.025)),.026,48)
box(6,'machined_alloy',tuple(p6-Vector((0,0,.051))),(.079,.104,.049),.006)
box(6,'dark_alloy',tuple(p6-Vector((0,0,.079))),(.071,.119,.008),.002)
for xx in [-.025,.025]:
    cyl(6,'machined_alloy',p6+Vector((xx,-.065,-.075)),p6+Vector((xx,.065,-.075)),.006,20)
for yy in [-.046,.046]:
    box(6,'dark_alloy',tuple(p6+Vector((0,yy,-.093))),(.067,.020,.03),.003)
    box(6,'machined_alloy',tuple(p6+Vector((0,yy,-.12))),(.052,.013,.051),.002)
    box(6,'gasket',tuple(p6+Vector((0,yy-math.copysign(.008,yy),-.135))),(.045,.005,.028),.001)
    for xx in [-.017,.017]:bolt(6,p6+Vector((xx,yy-math.copysign(.01,yy),-.12)),(0,-math.copysign(1,yy),0),.002)
for xx in [-.024,.024]:
    for yy in [-.035,.035]:bolt(6,p6+Vector((xx,yy,-.026)),r=.0023)
# Short flexible tool pigtails are local to the gripper so no false rigid inter-axis cables.
for yy in [-.035,.035]:
    hose(6,[tuple(p6+Vector((-.031,yy,-.033))),tuple(p6+Vector((-.047,yy,-.02))),tuple(p6+Vector((-.048,yy,-.066)))],.003)
    cyl(6,'blue',p6+Vector((-.047,yy,-.066)),p6+Vector((-.035,yy,-.066)),.0045,16)
# Create six parented joint empties with identity reference rotations.
root=bpy.data.objects.new('RIG_ROOT',None);robotcol.objects.link(root);root['robot_model_id']='abb-irb1200';root['reference_kind']='photo-based reconstruction'
rig=[]
for i,j in enumerate(manifest['joints']):
    ob=bpy.data.objects.new('RIG_J'+str(i+1),None);robotcol.objects.link(ob)
    ob.location=j['pivot'];bpy.context.view_layer.update();world=ob.matrix_world.copy()
    ob.parent=root if i==0 else rig[-1];ob.matrix_world=world
    ob['joint_index']=i+1;ob['joint_axis']=j['axis'];ob['joint_min_deg']=j['minDeg'];ob['joint_max_deg']=j['maxDeg'];ob['joint_home_deg']=j['homeDeg']
    rig.append(ob);bpy.context.view_layer.update()
tcp=bpy.data.objects.new('TCP',None);robotcol.objects.link(tcp);tcp.location=manifest['tcp'];bpy.context.view_layer.update();world=tcp.matrix_world.copy();tcp.parent=rig[-1];tcp.matrix_world=world;tcp['tool_center_point']=True
mesh_count=0;triangles=0
for (g,m),(vs,fs,sm) in B.items():
    mesh=bpy.data.meshes.new('ABB_Link%d_%s'%(g,m));mesh.from_pydata(vs,[],fs);mesh.materials.append(M[m]);mesh.update()
    ob=bpy.data.objects.new(mesh.name,mesh);robotcol.objects.link(ob);ob['equipment_id']='robot';ob['robot_model_id']='abb-irb1200'
    for poly,smooth in zip(mesh.polygons,sm):poly.use_smooth=smooth
    bpy.context.view_layer.update();world=ob.matrix_world.copy();ob.parent=root if g==0 else rig[g-1];ob.matrix_world=world
    mesh.calc_loop_triangles();triangles+=len(mesh.loop_triangles);mesh_count+=1
bpy.context.view_layer.update()
# Export just this scene and its robot collection, excluding studio geometry.
for ob in scene.objects:ob.select_set(False)
for ob in robotcol.objects:ob.select_set(True)
formats={item[0] for item in io_scene_gltf2.get_format_items(None,bpy.context)}
assert 'GLB' in formats
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'robot.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_extras=True,export_apply=True)
# Studio thumbnail, pure original geometry and neutral materials.
mat('studio',(.027,.034,.045),.22,.45)
mesh=bpy.data.meshes.new('ABB_StudioFloor');mesh.from_pydata([(-200,-200,-.005),(200,-200,-.005),(200,200,-.005),(-200,200,-.005)],[],[(0,1,2,3)]);mesh.materials.append(M['studio'])
floor=bpy.data.objects.new('ABB_StudioFloor',mesh);studio.objects.link(floor)
world=bpy.data.worlds.new('ABB_StudioWorld');world.use_nodes=True;bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs['Color'].default_value=(.045,.055,.075,1);bg.inputs['Strength'].default_value=.45;scene.world=world
for name,pos,power,size in [('key',(1.3,-1.7,2.3),370,2.0),('rim',(-1,1.2,1.8),470,1.6),('fill',(1.6,1.2,1.1),220,1.8)]:
    ld=bpy.data.lights.new('ABB_'+name,'AREA');ld.energy=power;ld.shape='DISK' if 'DISK' in {e.identifier for e in ld.bl_rna.properties['shape'].enum_items} else 'SQUARE';ld.size=size
    ob=bpy.data.objects.new('ABB_'+name,ld);studio.objects.link(ob);ob.location=pos;ob.rotation_euler=(Vector((.24,0,.5))-ob.location).to_track_quat('-Z','Y').to_euler()
camd=bpy.data.cameras.new('ABB_StudioCamera');cam=bpy.data.objects.new('ABB_StudioCamera',camd);studio.objects.link(cam);cam.location=(1.8,-2.2,1.48);cam.rotation_euler=(Vector((.30,0,.46))-cam.location).to_track_quat('-Z','Y').to_euler();camd.lens=65;scene.camera=cam
assert 'PERSP' in {e.identifier for e in camd.bl_rna.properties['type'].enum_items};camd.type='PERSP'
try:scene.render.engine='BLENDER_EEVEE'
except TypeError:pass
scene.render.resolution_x=1200;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
formats={e.identifier for e in scene.render.image_settings.bl_rna.properties['file_format'].enum_items};assert 'PNG' in formats;scene.render.image_settings.file_format='PNG';scene.render.filepath=os.path.join(OUT,'thumbnail.png')
scene.render.film_transparent=False
scene['model_note']=manifest['note'];scene['mesh_count']=mesh_count;scene['triangle_count']=triangles
bpy.data.libraries.write(os.path.join(OUT,'scene.blend'),{scene},fake_user=True,compress=True)
bpy.ops.render.render(write_still=True)
json.dump({**manifest,'geometry':{'triangles':triangles,'meshes':mesh_count}},open(os.path.join(OUT,'manifest.json'),'w'),ensure_ascii=False,indent=2)
print(json.dumps({'model':'abb-irb1200','meshes':mesh_count,'triangles':triangles,'output':OUT}))
