"""Original UR10e photo-reference reconstruction. Nominal manufacturer DH dimensions.
All external surfaces are newly authored procedural geometry; no OEM CAD is included.
Run through Blender MCP in Blender 5.2. Preserves every pre-existing scene.
"""
import bpy, math, json, os
from pathlib import Path
import io_scene_gltf2
from mathutils import Vector, Matrix
from collections import defaultdict
SOURCE=str(Path(__file__).resolve().parent)
OUT=str(Path(__file__).resolve().parents[3]/'public/models/robots/ur10e')
os.makedirs(OUT,exist_ok=True)
with open(os.path.join(SOURCE,'manifest.json')) as f: manifest=json.load(f)
scene=bpy.data.scenes.new('RoboSpace_UR10e_PhotoReference_Rigged')
bpy.context.window.scene=scene
robot=bpy.data.collections.new('UR10e_ORIGINAL_GEOMETRY');scene.collection.children.link(robot)
studio=bpy.data.collections.new('UR10e_STUDIO');scene.collection.children.link(studio)
root=bpy.data.objects.new('RIG_ROOT',None);robot.objects.link(root)
root['robot_id']='ur10e';root['reference_pose']='180,-75,50,-65,-90,0';root['nominal_dh']=True
P=[Vector(j['pivot']) for j in manifest['joints']]
AX=[Vector(j['axis']) for j in manifest['joints']]
joints=[]
for i,j in enumerate(manifest['joints']):
 ob=bpy.data.objects.new('RIG_J'+str(i+1),None);robot.objects.link(ob)
 ob.parent=root if i==0 else joints[-1];ob.matrix_parent_inverse=Matrix.Identity(4)
 ob.location=P[i]-(P[i-1] if i else Vector((0,0,0)));ob.rotation_euler=(0,0,0)
 ob['joint_index']=i+1;ob['joint_axis']=j['axis'];ob['home_deg']=j['homeDeg'];ob['min_deg']=j['minDeg'];ob['max_deg']=j['maxDeg'];ob['max_speed_deg']=j['maxSpeedDeg']
 joints.append(ob)
tcp=bpy.data.objects.new('TCP',None);robot.objects.link(tcp);tcp.parent=joints[-1];tcp.location=Vector(manifest['tcp'])-P[-1]
tcp['is_tcp']=True
M={}
def mat(key,color,metal=.75,rough=.3):
 m=bpy.data.materials.new('UR10e_'+key);m.diffuse_color=(*color,1);m.use_nodes=True
 bs=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough
 M[key]=m
mat('Silver',(0.53,.55,.59),.88,.24)
mat('Machined',(0.72,.74,.78),.9,.21)
mat('Satin',(0.26,.28,.31),.72,.35)
mat('Graphite',(.028,.032,.040),.46,.34)
mat('Rubber',(.014,.016,.022),.02,.76)
mat('Blue',(.015,.08,.42),.5,.32)
mat('Fastener',(.105,.12,.15),.92,.24)
B=defaultdict(lambda:[[],[],[]])
def geom(j,m,vs,fs,smooth=False):
 b=B[(j,m)];off=len(b[0]);b[0].extend([tuple(v) for v in vs]);b[1].extend([tuple(off+i for i in f) for f in fs]);b[2].extend([smooth]*len(fs))
def basis(axis):
 u=Vector(axis).normalized();v=u.cross(Vector((0,0,1)))
 if v.length<.1:v=u.cross(Vector((0,1,0)))
 v.normalize();w=u.cross(v).normalized();return u,v,w
def lathe(j,m,origin,axis,profile,n=64):
 p=Vector(origin);u,v,w=basis(axis);vs=[]
 for dist,r in profile:
  for i in range(n):
   t=math.tau*i/n;vs.append(p+u*dist+(v*math.cos(t)+w*math.sin(t))*r)
 fs=[tuple(reversed(range(n))),tuple(range((len(profile)-1)*n,len(profile)*n))]
 for k in range(len(profile)-1):
  fs.extend([(k*n+i,k*n+(i+1)%n,(k+1)*n+(i+1)%n,(k+1)*n+i) for i in range(n)])
 geom(j,m,vs,fs,True)
def cyl(j,m,a,b,r,n=48,r2=None):
 a,b=Vector(a),Vector(b);lathe(j,m,a,b-a,[(0,r),((b-a).length,r if r2 is None else r2)],n)
def ring(j,m,p,axis,r,width,n=64):lathe(j,m,p,axis,[(-width/2,r*.97),(-width*.3,r),(width*.3,r),(width/2,r*.97)],n)
def tube(j,m,a,b,r1,r2=None):
 a,b=Vector(a),Vector(b);L=(b-a).length;r2=r1 if r2 is None else r2
 lathe(j,m,a,b-a,[(0,r1*.82),(.008,r1),(.022,r1),(L-.022,r2),(L-.008,r2),(L,r2*.82)],64)
def bolt(j,p,axis,r=.004):
 p=Vector(p);u=Vector(axis).normalized();cyl(j,'Machined',p-u*.001,p+u*.001,r*1.35,20)
 cyl(j,'Fastener',p,p+u*.004,r,24);cyl(j,'Rubber',p+u*.004,p+u*.0045,r*.52,6)
def box(j,m,p,s,orient=None,bevel=.002):
 # 26-face rectangular body, manually chamfered for web export without modifiers.
 sx,sy,sz=[v/2 for v in s];r=min(bevel,min(sx,sy,sz)*.7)
 ringxy=[(-sx+r,-sy),(sx-r,-sy),(sx,-sy+r),(sx,sy-r),(sx-r,sy),(-sx+r,sy),(-sx,sy-r),(-sx,-sy+r)]
 vs=[]
 for z,shrink in [(-sz,r*.5),(-sz+r,0),(sz-r,0),(sz,r*.5)]:
  for x,y in ringxy:vs.append(Vector((x-math.copysign(shrink,x),y-math.copysign(shrink,y),z)))
 fs=[tuple(reversed(range(8))),tuple(range(24,32))]
 for k in range(3):fs.extend([(k*8+i,k*8+(i+1)%8,(k+1)*8+(i+1)%8,(k+1)*8+i) for i in range(8)])
 if orient:vs=[orient@v for v in vs]
 geom(j,m,[Vector(p)+v for v in vs],fs)
def pipe(j,m,pts,r=.003,n=12):
 for a,b in zip(pts,pts[1:]):cyl(j,m,a,b,r,n)
def cap(j,p,axis,r,depth):
 p=Vector(p);u=Vector(axis).normalized();_,v,w=basis(u)
 lathe(j,'Blue',p,u,[(-depth/2,r*.95),(-depth*.35,r),(depth*.35,r),(depth/2,r*.93)],64)
 ring(j,'Satin',p-u*depth*.53,u,r*1.025,.003)
 # Shallow concentric molded seam and five recessed cap screws.
 ring(j,'Blue',p+u*(depth*.52),u,r*.79,.002)
 for k in range(5):
  t=math.tau*k/5+.3;bolt(j,p+u*depth*.54+(v*math.cos(t)+w*math.sin(t))*(r*.82),u,.0033 if r>.075 else .0025)
 # Center medallion is blank: no manufacturer logo or copyrighted texture.
 ring(j,'Blue',p+u*depth*.52,u,r*.2,.0013,40)
def housing(j,p,axis,r,span,blue_j=None):
 p=Vector(p);u=Vector(axis).normalized()
 lathe(j,'Silver',p,u,[(-span/2,r*.83),(-span/2+.009,r*.98),(-span*.24,r),(.0,r),(span*.24,r),(span/2-.009,r*.98),(span/2,r*.83)],64)
 for sign in [-1,1]:
  ring(j,'Graphite',p+u*sign*(span*.39),u,r*1.004,.011)
  ring(j,'Machined',p+u*sign*(span*.3),u,r*1.006,.004)
 cap(j if blue_j is None else blue_j,p-u*(span*.5+.008),-u,r*.9,.014)
 # Rear service plate and tiny radial screws are deliberately separate from front cap.
 lathe(j,'Satin',p+u*span*.5,u,[(-.004,r*.82),(.003,r*.82),(.006,r*.68)],48)
 _,v,w=basis(u)
 for k in range(6):
  t=k*math.tau/6;bolt(j,p+u*(span*.5+.007)+(v*math.cos(t)+w*math.sin(t))*(r*.62),u,.003)
def link(j,a,b,r,offset=Vector((0,0,0))):
 a,b=Vector(a)+offset,Vector(b)+offset;u=(b-a).normalized()
 start=a+u*r*.76;end=b-u*r*.79
 tube(j,'Silver',start,end,r*.82,r*.78)
 for p in [start+u*.021,end-u*.021]:
  ring(j,'Machined',p,u,r*.835,.013)
  ring(j,'Satin',p+u*.01,u,r*.84,.003)
 # Longitudinal underside seam with a slim extruded aluminium cover.
 _,v,w=basis(u);normal=w if w.z<0 else -w
 pipe(j,'Satin',[start+normal*r*.795,end+normal*r*.755],.002,8)
 for p in [start+u*.041,end-u*.041]:bolt(j,p+normal*r*.8,normal,.0025)

# Fixed mount: exactly 190 mm outside diameter; bolt circle follows official base drawing.
lathe(-1,'Machined',(0,0,0),(0,0,1),[(0,.092),(.002,.095),(.017,.095),(.024,.090)],80)
ring(-1,'Graphite',(0,0,.023),(0,0,1),.09,.003,80)
for i in range(4):
 th=math.pi/4+i*math.pi/2;bolt(-1,(.085*math.cos(th),.085*math.sin(th),.023),(0,0,1),.005)
lathe(0,'Silver',(0,0,.023),(0,0,1),[(0,.088),(.009,.088),(.039,.074),(.080,.067),(.110,.073),(.136,.08)],80)
ring(0,'Graphite',(0,0,.13),(0,0,1),.072,.009)
ring(0,'Machined',(0,0,.114),(0,0,1),.070,.006)
# Base strain-relief and ribbed fixed cable boot; never a dangling world-space cable on a moving link.
cyl(-1,'Satin',(0,.068,.047),(0,.109,.047),.014,24)
for k in range(8):cyl(-1,'Rubber',(0,.100+k*.006,.047),(0,.104+k*.006,.047),.013-k*.00055,20)
# Main shoulder and elbow drums preserve actual pivot centres.
housing(0,P[1],AX[1],.095,.181,blue_j=1)
link(1,P[1],P[2],.083,Vector((0,.032,0)))
housing(1,P[2],AX[2],.074,.143,blue_j=2)
link(2,P[2],P[3],.064,Vector((0,.017,0)))
housing(2,P[3],AX[3],.054,.112,blue_j=3)
# Alternating orthogonal wrist axes and precise DH offsets give a workable compact wrist.
tube(3,'Silver',P[3]+AX[3]*.03,P[4]-AX[3]*.025,.046,.05)
ring(3,'Graphite',P[3]+AX[3]*.07,AX[3],.049,.008)
housing(3,P[4],AX[4],.054,.105,blue_j=4)
tube(4,'Silver',P[4]+AX[4]*.02,P[5]-AX[4]*.01,.048,.045)
housing(4,P[5],AX[5],.052,.105,blue_j=5)
flange=Vector(manifest['flange']);toolaxis=Vector(manifest['toolAxis'])
tube(5,'Satin',P[5]+toolaxis*.038,flange-toolaxis*.016,.044,.040)
lathe(5,'Machined',flange-toolaxis*.024,toolaxis,[(0,.043),(.003,.045),(.022,.045),(.024,.043)],64)
_,tv,tw=basis(toolaxis)
for i in range(4):
 th=math.pi/4+i*math.pi/2;bolt(5,flange+(tv*math.cos(th)+tw*math.sin(th))*.025,toolaxis,.003)
# Example parallel gripper: custom attachment, not an implied UR-supplied accessory.
q=toolaxis.to_track_quat('Z','Y')
box(5,'Graphite',flange+toolaxis*.025,(.105,.072,.041),q,.008)
box(5,'Satin',flange+toolaxis*.050,(.118,.073,.014),q,.003)
for sign in [-1,1]:
 center=flange+toolaxis*.078+tv*(sign*.040)
 box(5,'Machined',center,(.021,.053,.054),q,.003)
 finger=flange+toolaxis*.126+tv*(sign*.045)
 box(5,'Satin',finger,(.018,.037,.059),q,.002)
 box(5,'Rubber',flange+toolaxis*.134+tv*(sign*.032),(.006,.032,.043),q,.001)
 for off in [-.010,.01]:bolt(5,center+tw*.027+toolaxis*off,tw,.0025)
 # Three machined slots and replaceable serrated jaw pads.
 for k in range(5):box(5,'Graphite',flange+toolaxis*(.116+k*.007)+tv*sign*.028,(.007,.029,.0018),q,.0003)
for sign in [-1,1]:
 p=flange+toolaxis*.028+tw*sign*.038
 cyl(5,'Machined',p,p+tw*sign*.01,.005,16)
for x in [-.033,.033]:
 for y in [-.023,.023]:bolt(5,flange+toolaxis*.017+tv*x+tw*y,-toolaxis,.0025)
# Small I/O connector, finned tool strain relief, and local hose run remain attached to J6.
conn=flange-toolaxis*.05+tv*.044
cyl(5,'Graphite',conn,conn+tv*.022,.008,20)
for k in range(5):cyl(5,'Rubber',conn+tv*(.013+k*.004),conn+tv*(.015+k*.004),.009-k*.0007,20)
pipe(5,'Rubber',[conn+tv*.03,conn+tv*.037+toolaxis*.024,flange+tv*.065+toolaxis*.028,flange+tv*.055+toolaxis*.045],.0035,12)

meshobs=[]
for (j,m),(vs,fs,sm) in B.items():
 mesh=bpy.data.meshes.new('UR10e_'+str(j+1)+'_'+m);mesh.from_pydata(vs,[],fs);mesh.materials.append(M[m]);mesh.update()
 ob=bpy.data.objects.new('UR10e_'+str(j+1)+'_'+m,mesh);robot.objects.link(ob)
 for poly,s in zip(mesh.polygons,sm):poly.use_smooth=s
 # Convert world-authored vertices to rest-local coordinates; parents and inverse are identity rotations.
 parent=root if j<0 else joints[j];pivot=Vector((0,0,0)) if j<0 else P[j]
 for v in mesh.vertices:v.co-=pivot
 ob.parent=parent;ob.matrix_parent_inverse=Matrix.Identity(4);ob.location=(0,0,0);ob.rotation_euler=(0,0,0)
 ob['robot_id']='ur10e';ob['joint_segment']=j+1
 meshobs.append(ob)
# Export only this scene's robot collection; studio objects excluded.
for ob in scene.objects:ob.select_set(False)
for ob in robot.objects:ob.select_set(True)
bpy.context.view_layer.objects.active=root
formats={x[0] for x in io_scene_gltf2.get_format_items(None,bpy.context)}
if 'GLB' not in formats:raise RuntimeError('GLB exporter unavailable')
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'robot.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_extras=True,export_apply=False)
# Studio is kept in the editable .blend only. Wide luminous cards provide visible metal reflections.
mat('StudioFloor',(.105,.115,.135),.13,.37)
mesh=bpy.data.meshes.new('UR10e_studio_floor');mesh.from_pydata([(-10,-10,-.002),(10,-10,-.002),(10,10,-.002),(-10,10,-.002)],[],[(0,1,2,3)]);mesh.materials.append(M['StudioFloor'])
ob=bpy.data.objects.new('UR10e_studio_floor',mesh);studio.objects.link(ob)
world=bpy.data.worlds.new('UR10e_STUDIO_WORLD');scene.world=world;world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs['Color'].default_value=(.12,.14,.18,1);bg.inputs['Strength'].default_value=.7
lt={x.identifier for x in bpy.types.Light.bl_rna.properties['type'].enum_items}
if 'AREA' not in lt:raise RuntimeError('AREA light missing')
for name,p,energy,size in [('Key',(1,-3,4),420,4),('Rim',(-2,1,3),650,3),('Fill',(2,3,2),450,3),('Top',(0,0,5),300,2)]:
 ld=bpy.data.lights.new('UR10e_'+name,'AREA');ld.energy=energy;ld.shape='DISK' if 'DISK' in {i.identifier for i in ld.bl_rna.properties['shape'].enum_items} else 'SQUARE';ld.size=size
 lo=bpy.data.objects.new('UR10e_'+name,ld);studio.objects.link(lo);lo.location=p;lo.rotation_euler=(Vector((.4,0,.55))-lo.location).to_track_quat('-Z','Y').to_euler()
camd=bpy.data.cameras.new('UR10e_Camera');cam=bpy.data.objects.new('UR10e_Camera',camd);studio.objects.link(cam);cam.location=(2.45,-3.3,1.82);cam.rotation_euler=(Vector((.4,.05,.55))-cam.location).to_track_quat('-Z','Y').to_euler()
camd.type='ORTHO' if 'ORTHO' in {i.identifier for i in camd.bl_rna.properties['type'].enum_items} else 'PERSP';camd.ortho_scale=1.60;scene.camera=cam
try:scene.render.engine='BLENDER_EEVEE'
except TypeError:pass
scene.render.resolution_x=1200;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG' if 'PNG' in {i.identifier for i in scene.render.image_settings.bl_rna.properties['file_format'].enum_items} else scene.render.image_settings.file_format
scene.render.filepath=os.path.join(OUT,'thumbnail.png');scene.render.film_transparent=False
bpy.ops.render.render(write_still=True)
triangles=sum(sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in meshobs)
manifest['geometry']={'meshCount':len(meshobs),'triangleCount':triangles,'materials':7,'units':'meters','joints':6,'source':'original procedural photo-reference reconstruction'}
with open(os.path.join(OUT,'manifest.json'),'w') as f:json.dump(manifest,f,ensure_ascii=False,indent=2)
bpy.data.libraries.write(os.path.join(OUT,'scene.blend'),{scene},fake_user=True,compress=True)
# Leave model framed for MCP visual inspection.
for a in bpy.context.screen.areas:
 if a.type=='VIEW_3D':
  a.spaces.active.region_3d.view_distance=2.5;a.spaces.active.region_3d.view_location=Vector((.4,.05,.55));a.spaces.active.region_3d.view_rotation=cam.rotation_euler.to_quaternion()
print(json.dumps({'id':'ur10e','output':OUT,'meshes':len(meshobs),'triangles':triangles,'tcp':manifest['tcp'],'scene':scene.name}))
