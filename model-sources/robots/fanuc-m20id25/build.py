"""Original photo-based FANUC M-20iD/25 study; not OEM CAD or controller calibration.
Official dimensions guide the six-axis skeleton. All meshes are batched by joint/material.
Run from Blender MCP; this creates a new scene and preserves existing scenes.
"""
import bpy, math, json, os
from pathlib import Path
from mathutils import Vector, Matrix
from collections import defaultdict
import io_scene_gltf2
OUT=str(Path(__file__).resolve().parents[3]/'public/models/robots/fanuc-m20id25')
AUTHOR=str(Path(__file__).resolve().parent)
os.makedirs(OUT,exist_ok=True)
scene=bpy.data.scenes.new('RoboSpace_FANUC_M20iD25_PhotoStudy')
bpy.context.window.scene=scene
robotcol=bpy.data.collections.new('FANUC_M20iD25_RIG'); scene.collection.children.link(robotcol)
studio=bpy.data.collections.new('FANUC_M20iD25_Studio');scene.collection.children.link(studio)
M={}
def mat(key,c,metal=.0,rough=.4):
    m=bpy.data.materials.new('FNC_'+key);m.diffuse_color=(*c,1);m.use_nodes=True
    bs=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    bs.inputs['Base Color'].default_value=(*c,1);bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough
    M[key]=m
mat('cast',(0.55,0.56,0.59),.65,.3)
mat('pearl',(.79,.80,.82),.48,.26)
mat('graphite',(.033,.039,.051),.72,.29)
mat('rubber',(.012,.016,.023),.04,.7)
mat('chrome',(.6,.65,.73),.95,.2)
mat('machined',(.29,.33,.39),.87,.3)
mat('blue',(.022,.17,.55),.82,.24)
mat('letter',(.87,.9,.94),.12,.45)
B=defaultdict(lambda:[[],[],[]])
def geom(g,m,vs,fs,smooth=False):
    d=B[g,m];n=len(d[0]);d[0]+=list(vs);d[1]+=[tuple(n+i for i in f) for f in fs];d[2]+=[smooth]*len(fs)
def basis(axis):
    u=Vector(axis).normalized(); v=u.cross(Vector((0,0,1)))
    if v.length<.01:v=u.cross(Vector((0,1,0)))
    v.normalize();w=u.cross(v);return u,v,w

def cyl(g,m,a,b,r,n=32,r2=None):
    a=Vector(a);b=Vector(b);u,v,w=basis(b-a);r2=r if r2 is None else r2
    vs=[tuple(p+rr*(v*math.cos(i*math.tau/n)+w*math.sin(i*math.tau/n))) for p,rr in [(a,r),(b,r2)] for i in range(n)]
    fs=[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    geom(g,m,vs,fs,True)

def ring(g,m,p,axis,r,inner,depth=.014,n=48):
    p=Vector(p);u,v,w=basis(axis)
    vs=[]
    for dd,rr in [(-depth/2,r),(depth/2,r),(depth/2,inner),(-depth/2,inner)]:
        vs += [tuple(p+u*dd+rr*(v*math.cos(i*math.tau/n)+w*math.sin(i*math.tau/n))) for i in range(n)]
    fs=[]
    for k in range(4):
        for i in range(n):fs.append((k*n+i,k*n+(i+1)%n,((k+1)%4)*n+(i+1)%n,((k+1)%4)*n+i))
    geom(g,m,vs,fs,True)

def box(g,m,p,s,bevel=.008,quat=None):
    x,y,z=[v/2 for v in s];r=min(bevel,x*.6,y*.6,z*.6)
    ringxy=[(-x+r,-y),(x-r,-y),(x,-y+r),(x,y-r),(x-r,y),(-x+r,y),(-x,y-r),(-x,-y+r)]
    vs=[]
    for zz,edge in [(-z,1),(-z+r,0),(z-r,0),(z,1)]:
        for xx,yy in ringxy:
            q=Vector((xx-(r*.25 if xx>0 else -r*.25)*edge,yy-(r*.25 if yy>0 else -r*.25)*edge,zz))
            if quat is not None:q=quat@q
            vs.append(tuple(Vector(p)+q))
    fs=[tuple(reversed(range(8))),tuple(range(24,32))]
    for k in range(3):fs += [(k*8+i,k*8+(i+1)%8,(k+1)*8+(i+1)%8,(k+1)*8+i) for i in range(8)]
    geom(g,m,vs,fs)

def loft(g,m,points,widths,depths,n=32):
    # Smooth cast-metal body with subtly flattened side faces; dimensions in metres.
    pts=[Vector(p) for p in points];vs=[]
    for k,p in enumerate(pts):
        t=pts[min(k+1,len(pts)-1)]-pts[max(0,k-1)];t.normalize()
        y=Vector((0,1,0));v=t.cross(y).normalized()
        for i in range(n):
            a=math.tau*i/n; c=math.cos(a);s=math.sin(a)
            c=math.copysign(abs(c)**.55,c);s=math.copysign(abs(s)**.55,s)
            vs.append(tuple(p+y*(s*depths[k])+v*(c*widths[k])))
    fs=[tuple(reversed(range(n))),tuple(range((len(pts)-1)*n,len(pts)*n))]
    for k in range(len(pts)-1):fs += [(k*n+i,k*n+(i+1)%n,(k+1)*n+(i+1)%n,(k+1)*n+i) for i in range(n)]
    geom(g,m,vs,fs,True)

def pipe(g,m,pts,r=.008,n=12):
    for a,b in zip(pts,pts[1:]):cyl(g,m,a,b,r,n)

def bolt(g,p,axis=(0,0,1),size=.009):
    p=Vector(p);u,v,w=basis(axis)
    cyl(g,'machined',p-u*.002,p+u*.004,size*1.4,24)
    cyl(g,'chrome',p+u*.003,p+u*.01,size,6)
    cyl(g,'graphite',p+u*.0102,p+u*.0105,size*.48,6)

def bolt_circle(g,p,axis,r,count=8,size=.007):
    p=Vector(p);u,v,w=basis(axis)
    for i in range(count):
        a=math.tau*i/count;bolt(g,p+r*(v*math.cos(a)+w*math.sin(a)),axis,size)

def mesh_label(g,txt,p,size=.035,rot=(math.pi/2,0,0),material='letter'):
    cv=bpy.data.curves.new('FNC_label_'+txt,'FONT');cv.body=txt;cv.size=size;cv.extrude=.00015
    cv.align_x='CENTER';ob=bpy.data.objects.new('FNC_'+txt,cv);robotcol.objects.link(ob);ob.location=p;ob.rotation_euler=rot;cv.materials.append(M[material]);ob['rig_group']=g
    return ob

P=[(0,0,.24),(.075,0,.425),(-.075,0,1.2515),(-.075,0,1.4665),(.7759,0,1.2055),(.86195,0,1.1791)]
F=Vector((.95604,0,-.29324)).normalized()
AX=[(0,0,1),(0,1,0),(0,1,0),tuple(F),(0,1,0),tuple(F)]
TCP=tuple(Vector(P[5])+F*.205)
# Floor plate, profiled low pedestal and hollow J1 bearing stack.
box(0,'graphite',(0,0,.025),(.50,.50,.05),.025)
for x in [-.205,.205]:
    for y in [-.205,.205]:
        ring(0,'chrome',(x,y,.052),(0,0,1),.025,.011,.006,32);bolt(0,(x,y,.057),size=.014)
for z,w,d in [(.062,.43,.038),(.18,.34,.052)]:box(0,'graphite',(0,0,z),(w,w,d),.035)
# Tapered square body panel mesh with strengthening ribs.
vs=[(x,y,z) for z,rr in [(.08,.215),(.205,.17)] for x,y in [(-rr,-rr),(rr,-rr),(rr,rr),(-rr,rr)]]
geom(0,'graphite',vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
for x in [-.16,.16]:
    for y in [-.17,.17]:cyl(0,'machined',(x,y,.07),(x*.74,y*.74,.204),.017,8)
ring(0,'chrome',(0,0,.202),(0,0,1),.168,.093,.012,64)
ring(0,'graphite',(0,0,.229),(0,0,1),.157,.078,.042,64)
ring(1,'cast',(0,0,.264),(0,0,1),.166,.078,.03,64)
ring(1,'blue',(0,0,.282),(0,0,1),.163,.156,.005,64)
bolt_circle(1,(0,0,.285),(0,0,1),.141,12,.007)
# Connector bulkhead and plugs on the stationary pedestal.
box(0,'machined',(-.012,.203,.105),(.25,.026,.08),.01)
for x,r in [(-.082,.023),(-.026,.017),(.026,.018),(.078,.013)]:
    cyl(0,'rubber',(x,.218,.112),(x,.229,.112),r,24);ring(0,'chrome',(x,.231,.112),(0,1,0),r*.92,r*.7,.007,24)
    for k in range(4):
        a=math.tau*k/4;cyl(0,'chrome',(x+.007*math.cos(a),.231,.112+.007*math.sin(a)),(x+.007*math.cos(a),.234,.112+.007*math.sin(a)),.0013,6)
# Rotating shoulder yoke, J2 reducer and servomotor.
loft(1,'cast',[(0,0,.285),(.045,0,.32),(.075,0,.42),(.072,0,.475)],[.14,.15,.15,.075],[.11,.118,.108,.075])
for y in [-.132,.132]:
    cyl(1,'graphite',(.075,y-.006,.425),(.075,y+.006,.425),.147,64)
    ring(1,'chrome',(.075,y,.425),(0,1,0),.148,.131,.01,64)
cyl(1,'graphite',(.075,.134,.425),(.075,.27,.425),.095,48)
box(1,'graphite',(.075,.288,.425),(.158,.09,.17),.023)
for x in [-.064,-.04,-.016,.008,.032,.056]:box(1,'machined',(.075+x,.269,.426),(.008,.105,.135),.003)
box(1,'rubber',(.075,.314,.49),(.10,.064,.041),.005)
for dz in [-.052,.052]:
    for dx in [-.052,.052]:bolt(1,(.075+dx,.337,.425+dz),(0,1,0),.006)
# Moving upper arm: the distinguishing concave curved cast link of the M-20iD.
cyl(2,'cast',(.075,-.136,.425),(.075,-.16,.425),.146,64)
ring(2,'machined',(.075,-.162,.425),(0,1,0),.119,.113,.004,64)
bolt_circle(2,(.075,-.168,.425),(0,-1,0),.111,10,.006)
cyl(2,'pearl',(.075,-.163,.425),(.075,-.171,.425),.089,48)
armpts=[(.075,0,.425),(.02,0,.5),(-.065,0,.66),(-.105,0,.86),(-.112,0,1.05),(-.075,0,1.20),(-.075,0,1.2515)]
loft(2,'pearl',armpts,[.133,.135,.111,.095,.09,.102,.075],[.089,.087,.071,.067,.067,.075,.063])
# Narrow rear casting seam and removable side inspection cover.
pipe(2,'machined',[(x,y-.072,z) for x,y,z in armpts[1:-1]],.0035,8)
loft(2,'cast',[(.01,-.073,.53),(-.07,-.074,.7),(-.108,-.07,.89),(-.108,-.07,1.075),(-.08,-.07,1.18)],[.032,.038,.035,.033,.02],[.004]*5,24)
for x,z in [(.005,.55),(-.08,.73),(-.108,.92),(-.10,1.10)]:bolt(2,(x,-.081,z),(0,-1,0),.005)
# The factory-routed cable stays close to the upper arm, with ferrules and clips.
cp=[(.0,.124,.34),(-.09,.124,.48),(-.185,.12,.66),(-.20,.12,.85),(-.2,.12,1.07),(-.18,.115,1.23),(-.105,.112,1.3)]
for dy in [-.012,.009]:pipe(2,'rubber',[(x,y+dy,z) for x,y,z in cp],.010,12)
for x,z in [(-.18,.68),(-.20,.93),(-.18,1.18)]:
    box(2,'machined',(x,.126,z),(.053,.034,.025),.007);bolt(2,(x,.148,z),(0,1,0),.005)
# Elbow J3 exposed reducer, motor and curved forearm saddle.
for y in [-.096,.105]:
    cyl(3,'cast',(-.075,y-.017,1.2515),(-.075,y+.017,1.2515),.128,64)
    ring(3,'graphite',(-.075,y,1.2515),(0,1,0),.12,.115,.02,64)
bolt_circle(3,(-.075,-.116,1.2515),(0,-1,0),.10,8,.006)
cyl(3,'graphite',(-.075,.13,1.2515),(-.075,.23,1.2515),.073,40)
box(3,'graphite',(-.075,.258,1.2515),(.119,.065,.134),.015)
for dx in [-.042,-.023,-.004,.015,.034]:box(3,'machined',(-.075+dx,.247,1.2515),(.006,.075,.104),.002)
loft(3,'cast',[(-.075,0,1.245),(-.107,0,1.305),(-.14,0,1.385),(-.09,0,1.455),(-.015,0,1.4665)],[.105,.112,.118,.11,.094],[.097,.094,.09,.085,.081])
# Subtle side ribs and a machined mounting accessory pad.
for side in [-1,1]:
    pipe(3,'machined',[(-.155,side*.083,1.29),(-.203,side*.078,1.37),(-.162,side*.078,1.425)],.006,10)
box(3,'graphite',(-.17,.015,1.422),(.027,.16,.074),.006)
for y in [-.045,.065]:bolt(3,(-.188,y,1.425),(-1,0,0),.006)
# Long hollow forearm; its rotation is J4 about the sloping roll axis.
p4=Vector(P[3]);p5=Vector(P[4]);length=(p5-p4).length
ring(4,'graphite',p4+F*.06,F,.115,.055,.025,64)
ring(4,'chrome',p4+F*.075,F,.105,.055,.012,64)
loft(4,'pearl',[tuple(p4+F*t) for t in [.08,.11,.19,.40,.63,.73,.77]],[.101,.103,.095,.081,.069,.07,.073],[.084,.084,.08,.071,.065,.067,.069],40)
# Service hatch, fastening rails and identification label.
for sign in [-1,1]:
    pipe(4,'machined',[tuple(p4+F*t+Vector((0,sign*.073,0))) for t in [.19,.4,.62]],.003,8)
    for t in [.2,.38,.56,.7]:
        q=p4+F*t+Vector((0,sign*(.083-.024*t),0));bolt(4,q,(0,sign,0),.0045)
labelmid=p4+F*.42
box(4,'graphite',(labelmid.x,-.076,labelmid.z),(.205,.006,.048),.006)
mesh_label(4,'M-20iD / 25',(labelmid.x,-.081,labelmid.z-.009),.024)
for sign in [-1,1]:
    q=p4+F*.14+Vector((0,sign*.087,0));ring(4,'blue',q,(0,sign,0),.018,.01,.004,24)
# Hollow wrist bulb shell with open bore and transverse J5 trunnion.
wp=p4+F*.765
loft(4,'graphite',[tuple(wp+F*t) for t in [0,.025,.065,.10]],[.073,.089,.10,.085],[.07,.078,.074,.058],40)
cyl(5,'graphite',tuple(p5+Vector((0,-.068,0))),tuple(p5+Vector((0,.068,0))),.083,48)
for sign in [-1,1]:
    ring(5,'machined',p5+Vector((0,sign*.069,0)),(0,1,0),.063,.043,.014,48)
    bolt_circle(5,p5+Vector((0,sign*.077,0)),(0,sign,0),.052,6,.004)
# J5 saddle carries a J6 annular flange, with a genuine open cable bore.
p6=Vector(P[5]);loft(5,'graphite',[tuple(p5),tuple(p6-F*.01)],[.071,.052],[.056,.051],32)
ring(6,'machined',p6,F,.056,.029,.024,64)
ring(6,'chrome',p6+F*.015,F,.05,.028,.009,64)
ring(6,'rubber',p6+F*.02,F,.035,.028,.011,48)
bolt_circle(6,p6+F*.024,F,.042,6,.004)
# Generic parallel pneumatic gripper: adapter, rails, separate machined fingers.
q=F.to_track_quat('Z','Y')
center=p6+F*.072
box(6,'machined',center,(.085,.12,.075),.009,q)
box(6,'blue',center+Vector((0,-.062,0)),(.035,.005,.014),.002,q)
for sgn in [-1,1]:
    railp=p6+F*.119+Vector((0,sgn*.039,0))
    box(6,'chrome',railp,(.045,.024,.044),.005,q)
    finger=p6+F*.164+Vector((0,sgn*.046,0))
    box(6,'machined',finger,(.026,.019,.09),.004,q)
    tip=p6+F*.2+Vector((0,sgn*.037,0))
    box(6,'rubber',tip,(.032,.012,.03),.003,q)
    for t in [.147,.18]:bolt(6,p6+F*t+Vector((0,sgn*.06,0)),(0,sgn,0),.003)
# Short tool service tubes and connectors, confined to the J6 adapter assembly.
for dy in [-.022,.022]:
    pp=p6+F*.07+Vector((0,dy,.045));cyl(6,'chrome',pp,pp+Vector((0,0,.014)),.005,12)
    pipe(6,'rubber',[pp+Vector((0,0,.014)),p6+F*.035+Vector((0,dy,.069)),p6+Vector((0,dy,.058))],.003,8)
# Small neutral badges on pedestal and upper cast link.
box(0,'machined',(0,-.222,.12),(.18,.005,.037),.003)
mesh_label(0,'FANUC',(0,-.226,.113),.023)
mesh_label(2,'J2',(.067,-.176,.42),.021,material='machined')

# Rig: identity reference rotations, actual metre pivots and explicit axis vectors.
root=bpy.data.objects.new('RIG_ROOT',None);robotcol.objects.link(root);root['robot_model_id']='fanuc-m20id25';root['reference_reconstruction']=True
rig={0:root};home=[0,-10,-70,0,0,0]
mins=[-170,-100,-268,-200,-180,-360];maxs=[170,160,190,200,180,360];speeds=[210,210,265,420,420,720]
labels=['베이스 회전','어깨 회전','팔꿈치 회전','전완 롤','손목 피치','공구 롤']
for i,p in enumerate(P,1):
    ob=bpy.data.objects.new('RIG_J'+str(i),None);robotcol.objects.link(ob);ob.parent=rig[i-1];ob.location=Vector(p)-(Vector(P[i-2]) if i>1 else Vector((0,0,0)))
    ob['joint_index']=i;ob['joint_axis']=list(AX[i-1]);ob['min_deg']=mins[i-1];ob['max_deg']=maxs[i-1];ob['home_deg']=home[i-1];rig[i]=ob
for (g,m),(vs,fs,sm) in B.items():
    pivot=Vector(P[g-1]) if g else Vector((0,0,0));mesh=bpy.data.meshes.new('FNC_J'+str(g)+'_'+m)
    mesh.from_pydata([tuple(Vector(v)-pivot) for v in vs],[],fs);mesh.materials.append(M[m]);mesh.update()
    ob=bpy.data.objects.new('FNC_J'+str(g)+'_'+m,mesh);robotcol.objects.link(ob);ob.parent=rig[g];ob['equipment_id']='robot';ob['rig_group']=g
    for poly,smooth in zip(mesh.polygons,sm):poly.use_smooth=smooth
for ob in list(robotcol.objects):
    if ob.type=='FONT':
        g=int(ob['rig_group']);ob.parent=rig[g];ob.location-=Vector(P[g-1]) if g else Vector((0,0,0))
tcp=bpy.data.objects.new('TCP',None);robotcol.objects.link(tcp);tcp.parent=rig[6];tcp.location=Vector(TCP)-Vector(P[5]);tcp['tcp']=True
bpy.context.view_layer.update()
# Convert labels only; all geometry stays compact and already batched.
for ob in list(robotcol.objects):
    if ob.type=='FONT':
        bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob;bpy.ops.object.convert(target='MESH')
# Export only this robot from this scene, preserving every other scene.
bpy.ops.object.select_all(action='DESELECT')
for ob in robotcol.objects:ob.select_set(True)
formats={entry[0] for entry in io_scene_gltf2.get_format_items(None,bpy.context)}
if 'GLB' not in formats:raise RuntimeError('GLB export unavailable')
bpy.ops.export_scene.gltf(filepath=OUT+'/robot.glb',export_format='GLB',use_selection=True,use_active_scene=True,export_extras=True,export_apply=False)
# Studio is excluded from GLB but included in the editable blend scene.
mesh=bpy.data.meshes.new('FNC_studio_floor');mesh.from_pydata([(-200,-200,-.014),(200,-200,-.014),(200,200,-.014),(-200,200,-.014)],[],[(0,1,2,3)]);mesh.materials.append(M['graphite'])
fl=bpy.data.objects.new('FNC_studio_floor',mesh);studio.objects.link(fl)
world=bpy.data.worlds.new('FNC_studio_world');world.use_nodes=True;scene.world=world
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs['Color'].default_value=(.06,.075,.10,1);bg.inputs['Strength'].default_value=.35
for name,p,energy,size in [('key',(1.2,-3,4.4),1100,3.0),('rim',(-2.0,1.5,3.7),1600,2.5),('front',(3,2.2,2),850,2.0)]:
    light=bpy.data.lights.new('FNC_'+name,'AREA');light.energy=energy;light.shape='DISK';light.size=size;ob=bpy.data.objects.new('FNC_'+name,light);studio.objects.link(ob);ob.location=p;ob.rotation_euler=(Vector((.3,0,.9))-ob.location).to_track_quat('-Z','Y').to_euler()
camdata=bpy.data.cameras.new('FNC_camera');cam=bpy.data.objects.new('FNC_camera',camdata);studio.objects.link(cam);scene.camera=cam;cam.location=(2.8,-4.2,2.7);cam.rotation_euler=(Vector((.36,0,.79))-cam.location).to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO';camdata.ortho_scale=2.05
try:scene.render.engine='BLENDER_EEVEE'
except TypeError:scene.render.engine='CYCLES';scene.cycles.samples=32
scene.render.resolution_x=1200;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.filepath=OUT+'/thumbnail.png';scene.render.film_transparent=False
bpy.ops.render.render(write_still=True)
bpy.data.libraries.write(OUT+'/scene.blend',{scene},fake_user=True,compress=True)
triangles=sum(sum(len(poly.vertices)-2 for poly in ob.data.polygons) for ob in robotcol.objects if ob.type=='MESH')
manifest={
 'id':'fanuc-m20id25','name':'FANUC M-20iD/25','manufacturer':'FANUC','category':'중하중 산업용 · 6축','description':'1.831 m 도달거리와 중공 손목을 갖춘 25 kg급 머시닝·물류 핸들링 로봇. 굽은 주물 링크, 감속기, 케이블 커넥터와 평행 그리퍼를 세밀하게 구성했습니다.',
 'reach':1.831,'payloadKg':25,'massKg':250,'footprintDiameter':.71,
 'joints':[{'name':'J'+str(i+1),'label':labels[i],'pivot':list(P[i]),'axis':list(AX[i]),'minDeg':mins[i],'maxDeg':maxs[i],'maxSpeedDeg':speeds[i],'homeDeg':home[i]} for i in range(6)],
 'tcp':list(TCP),'sources':[{'title':'FANUC America M-20iD/25 공식 제품·사진·사양','url':'https://www.fanucamerica.com/products/robot/m-20id-25'},{'title':'FANUC M-20iD/25 공식 도달범위·치수 도면','url':'https://cdn.craft.cloud/6166486b-1eb4-43d5-990c-ea573de4e750/assets/files/data-sheets/m-20id-25-datasheet.pdf'}],
 'note':'공식 사진과 사양을 참고해 새로 만든 근사 모델입니다. 중립 메탈릭 마감과 범용 그리퍼를 적용했습니다. 주물 외형·장착판·공구 치수 및 화면의 관절 영점은 시뮬레이션용이며 제조사 CAD나 실제 제어기 교정 데이터가 아닙니다. J6은 현행 제품 페이지의 720° 범위를 사용합니다.',
 'geometry':{'triangles':triangles,'meshObjects':sum(ob.type=='MESH' for ob in robotcol.objects),'rigJoints':6},
 'referenceDimensionsMm':{'shoulderHeight':425,'upperArm':840,'forearm':890,'elbowOffset':215,'baseOffset':75,'flangeOffset':90},
 'assets':{'robot':'/models/robots/fanuc-m20id25/robot.glb','blend':'/models/robots/fanuc-m20id25/scene.blend','thumbnail':'/models/robots/fanuc-m20id25/thumbnail.png'}
}
for dest in [AUTHOR+'/manifest.json',OUT+'/manifest.json']:
    with open(dest,'w',encoding='utf-8') as f:json.dump(manifest,f,ensure_ascii=False,indent=2)
print('FANUC_BUILD_COMPLETE',json.dumps(manifest['geometry']),OUT)
