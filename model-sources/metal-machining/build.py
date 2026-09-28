import bpy, math, json, os, random
import io_scene_gltf2
from mathutils import Vector, Matrix, Quaternion
from collections import defaultdict
random.seed(47)
OUT='/tmp/robospace-scenarios/metal-machining'
os.makedirs(OUT, exist_ok=True)
scene=bpy.data.scenes.new('RoboSpace_Metal_Machining_28x20')
bpy.context.window.scene=scene
factory=bpy.data.collections.new('METAL_FACTORY_28x20'); scene.collection.children.link(factory)
robotcol=bpy.data.collections.new('METAL_ROBOT_MT2200_6AXIS'); scene.collection.children.link(robotcol)
studio=bpy.data.collections.new('METAL_STUDIO'); scene.collection.children.link(studio)
M={}
def mat(name,tone,metal=0,rough=.4,emit=0):
    color=(tone,tone,tone)
    m=bpy.data.materials.new('MT_'+name); m.diffuse_color=(*color,1); m.use_nodes=True
    bs=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    bs.inputs['Base Color'].default_value=(*color,1); bs.inputs['Metallic'].default_value=metal; bs.inputs['Roughness'].default_value=rough
    if emit: bs.inputs['Emission Color'].default_value=(*color,1); bs.inputs['Emission Strength'].default_value=emit
    M[name]=m; return m
mat('concrete',.29,.04,.78);mat('epoxy',.24,.14,.5);mat('wall',.54,.18,.61)
mat('steel',.42,.88,.25);mat('brushed',.67,.79,.29);mat('darksteel',.075,.74,.34)
mat('black',.018,.15,.56);mat('rubber',.03,0,.8);mat('white',.79,.28,.28)
mat('glass',.055,.8,.14);mat('label',.88,.12,.45);mat('light',.95,.1,.24,3)
B=defaultdict(lambda:[[],[],[]])
# Mesh parts are batched by equipment and material for a low draw-call export.
def addgeom(group,material,verts,faces,smooth=False):
    b=B[(group,material)]; n=len(b[0]); b[0].extend(verts); b[1].extend([tuple(n+i for i in f) for f in faces]); b[2].extend([smooth]*len(faces))
def box(g,m,p,s,bevel=0,rot=0):
    # Explicit beveled octagonal section, retaining flat machine-panel faces.
    x,y,z=s[0]/2,s[1]/2,s[2]/2; r=min(bevel,x*.8,y*.8,z*.8)
    if r<=0:
        vs=[(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)]
        fs=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
    else:
        ring=[(-x+r,-y),(x-r,-y),(x,-y+r),(x,y-r),(x-r,y),(-x+r,y),(-x,y-r),(-x,-y+r)]
        vs=[]
        for zz,scale in [(-z,1),(-z+r,0),(z-r,0),(z,1)]:
            for xx,yy in ring:
                vs.append((xx-(r*.32 if xx>0 else -r*.32)*scale,yy-(r*.32 if yy>0 else -r*.32)*scale,zz))
        fs=[tuple(reversed(range(8))),tuple(range(24,32))]
        for j in range(3):
            fs += [(j*8+i,j*8+(i+1)%8,(j+1)*8+(i+1)%8,(j+1)*8+i) for i in range(8)]
    c,ss=math.cos(rot),math.sin(rot)
    vs=[(p[0]+v[0]*c-v[1]*ss,p[1]+v[0]*ss+v[1]*c,p[2]+v[2]) for v in vs]
    addgeom(g,m,vs,fs)
def cyl(g,m,a,b,r,n=16,r2=None):
    a=Vector(a); b=Vector(b); d=b-a; q=d.to_track_quat('Z','Y'); rr=r if r2 is None else r2
    vs=[]
    for pp,rad in [(a,r),(b,rr)]:
        vs.extend([tuple(pp+q@Vector((rad*math.cos(2*math.pi*i/n),rad*math.sin(2*math.pi*i/n),0))) for i in range(n)])
    fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    addgeom(g,m,vs,fs,True)
def pipe(g,m,pts,r=.02,n=10):
    for i in range(len(pts)-1): cyl(g,m,pts[i],pts[i+1],r,n)
def bolt(g,p,axis='z',r=.025):
    v=Vector((0,0,.015)) if axis=='z' else Vector((0,.015,0))
    cyl(g,'darksteel',Vector(p)-v,Vector(p)+v,r,6)
def panel(g,p,s,m='brushed'):
    box(g,m,p,s,.015)
    for xx in [-s[0]/2+.065,s[0]/2-.065]:
        for zz in [-s[2]/2+.065,s[2]/2-.065]: bolt(g,(p[0]+xx,p[1]-s[1]/2-.008,p[2]+zz),'y',.012)
def foot(g,x,y,z=.72):
    cyl(g,'steel',(x,y,.06),(x,y,z),.028)
    cyl(g,'rubber',(x,y,.01),(x,y,.06),.065)
    cyl(g,'steel',(x,y,.11),(x,y,.16),.04,6)
def label(g,text,p,size=.16,rot=(math.pi/2,0,0),m='label'):
    cv=bpy.data.curves.new(g+'_Label','FONT'); cv.body=text; cv.size=size; cv.extrude=.0008
    align_values={item.identifier for item in cv.bl_rna.properties['align_x'].enum_items}
    if 'CENTER' not in align_values: raise RuntimeError('CENTER text alignment unavailable')
    cv.align_x='CENTER'
    ob=bpy.data.objects.new(g+'_Label_'+text,cv); factory.objects.link(ob); ob.location=p; ob.rotation_euler=rot; ob.data.materials.append(M[m]); return ob

def flush(collection=factory):
    obs=[]
    for (g,m),(vs,fs,sm) in list(B.items()):
        if not vs: continue
        mesh=bpy.data.meshes.new(g+'__'+m); mesh.from_pydata(vs,[],fs); mesh.materials.append(M[m]); mesh.update()
        ob=bpy.data.objects.new(g+'__'+m,mesh); collection.objects.link(ob)
        ob['equipment_id']=g
        for poly,smooth in zip(mesh.polygons,sm): poly.use_smooth=smooth
        obs.append(ob)
    B.clear(); return obs

# Heavy industrial cutaway: expansion joints, roof steelwork, crane and wall services.
box('hall','concrete',(0,0,-.19),(28.3,20.3,.36),.06)
for ix in range(14):
    for iy in range(10): box('floor','epoxy',(-13+2*ix,-9+2*iy,-.008),(1.984,1.984,.025))
box('envelope','wall',(0,10,3.35),(28,.21,6.7),.02)
box('envelope','wall',(-14,0,3.35),(.21,20,6.7),.02)
for x in range(-13,14):
    box('envelope','steel',(x,9.885,3.35),(.022,.012,6.65))
    for z in [.6,2.8,4.8]: bolt('envelope',(x,9.86,z),'y',.014)
for x in [-12,-6,0,6,12]:
    box('structure','darksteel',(x,9.55,3.35),(.22,.5,6.7))
    for y in [9.3,9.8]: box('structure','steel',(x,y,3.35),(.5,.05,6.7))
    box('structure','steel',(x,9.55,.1),(.7,.85,.2),.02)
    for dx in [-.27,.27]:
        for dy in [-.33,.33]: bolt('structure',(x+dx,9.55+dy,.21),r=.035)
for y in [-7,0,7]:
    # Open lattice crossbeams leave the equipment visible from a high camera.
    for z in [5.7,6.5]: box('structure','darksteel',(0,y,z),(27.5,.15,.12))
    for i in range(18):
        x=-13.5+i*1.5
        pipe('structure','steel',[(x,y,5.75),(x+.75,y,6.45),(x+1.5,y,5.75)],.045,8)
    for x in [-10,-5,0,5,10]:
        box('lighting','darksteel',(x,y,5.53),(2.7,.38,.13),.025)
        box('lighting','light',(x,y,5.45),(2.5,.28,.035),.01)
for x in [-12.9,12.9]:
    box('structure','steel',(x,0,5.1),(.15,19.4,.48))
    box('structure','darksteel',(x,0,5.38),(.55,19.5,.08))
# Bridge crane, wheeled trolley, cable drum and hook.
for y in [6.55,7.3]:
    box('structure','steel',(0,y,5.53),(26.3,.27,.45),.02)
    for z in [5.28,5.78]: box('structure','darksteel',(0,y,z),(26.3,.6,.06))
box('structure','darksteel',(5.8,6.9,5.86),(1.5,1.5,.16),.03)
cyl('structure','steel',(5.8,6.4,6.03),(5.8,7.4,6.03),.2,32)
for y in [6.45+i*.055 for i in range(17)]: cyl('structure','black',(5.8,y,6.03),(5.8,y+.022,6.03),.21,32)
for y in [6.72,7.05]: pipe('utilities','black',[(5.8,y,5.8),(5.8,y,3.4)],.014,10)
box('utilities','darksteel',(5.8,6.89,3.35),(.21,.5,.15),.04)
pts=[(5.8+.12*math.cos(a),6.89,3.15+.16*math.sin(a)) for a in [i*math.pi/12 for i in range(17)]]
pipe('utilities','steel',pts,.045,12)
for z in [4.1,4.35,4.6]:
    cyl('utilities','steel',(-13.6,9.35,z),(13.2,9.35,z),.075,20)
    for x in range(-13,14,2): cyl('utilities','darksteel',(x-.025,9.35,z),(x+.025,9.35,z),.092,20)
for x in [-10,-5,2,8]:
    pipe('utilities','steel',[(x,9.35,4.1),(x,9.35,1.4),(x,9.04,1.4)],.028)
    cyl('utilities','darksteel',(x,9.04,1.4),(x,8.9,1.4),.09,16)
    for a in range(6): pipe('utilities','steel',[(x,8.88,1.4),(x+.08*math.cos(a*math.pi/3),8.88,1.4+.08*math.sin(a*math.pi/3))],.008,6)
for x in [-9,-3,3,9]:
    box('windows','darksteel',(x,9.84,5.6),(4.4,.08,1.25))
    box('windows','glass',(x,9.79,5.6),(4.26,.035,1.12))
    for dx in [-1.05,0,1.05]: box('windows','steel',(x+dx,9.76,5.6),(.035,.03,1.13))
label('envelope','PRECISION MACHINING / CELL M-01',(-3,9.74,3.9),.36)
for y in [-5.3,-7.1]: box('traffic','white',(0,y,.012),(26,.055,.016))
for x in [-10,-5,0,5,10]:
    box('traffic','white',(x,-6.2,.017),(1,.055,.015))
    for sign in [-1,1]: box('traffic','white',(x+.37,-6.2+sign*.16,.017),(.45,.055,.015),rot=-sign*.7)
label('traffic','MATERIAL FLOW',(-3,-7.7,.035),.35,rot=(0,0,0),m='white')

def hmi(g,x,y,z):
    box(g,'darksteel',(x,y,z),(.5,.13,.58),.035)
    box(g,'glass',(x-.025,y-.074,z+.115),(.38,.02,.29),.016)
    for i in range(5): box(g,'white',(x-.1,y-.087,z+.21-i*.044),(.14+(i%2)*.13,.008,.011))
    for i in range(4):
        for j in range(3): box(g,'brushed',(x-.17+i*.086,y-.08,z-.105-j*.065),(.048,.015,.04),.005)
    cyl(g,'steel',(x+.16,y-.08,z-.16),(x+.16,y-.145,z-.16),.045,24)
    cyl(g,'black',(x+.16,y-.145,z-.16),(x+.16,y-.17,z-.16),.034,24)

def flanged(g,a,b,r=.09):
    cyl(g,'steel',a,b,r,32)
    u=(Vector(b)-Vector(a)).normalized()
    for p in [Vector(a),Vector(b)]:
        cyl(g,'darksteel',p-u*.035,p+u*.035,r*1.4,32)

def spindle(g,x,y,z):
    # Horizontal spindle, concentric chuck, three independent jaws and stock bar.
    for off,r in [(0,.35),(-.08,.3),(-.17,.24)]: cyl(g,'steel',(x,y+off,z),(x,y+off-.055,z),r,48)
    for a in range(12):
        th=a*math.pi/6; bolt(g,(x+.285*math.cos(th),y-.095,z+.285*math.sin(th)),'y',.016)
    for a in range(3):
        th=a*math.pi*2/3
        box(g,'darksteel',(x+.13*math.cos(th),y-.225,z+.13*math.sin(th)),(.13,.16,.12),.012)
    cyl(g,'brushed',(x,y-.23,z),(x,y-.65,z),.105,40)

def cnc(g,x,y,number):
    w,d=3.8,3.5
    # Hollow machine enclosure with a deep open machining bay, not a solid cube.
    box(g,'darksteel',(x,y,.22),(w,d,.44),.09)
    for dx in [-1.67,1.67]:
        for dy in [-1.45,1.45]: foot(g,x+dx,y+dy,.35)
    box(g,'white',(x,y+1.55,1.8),(w,.36,2.8),.06)
    for dx in [-1.72,1.72]: box(g,'white',(x+dx,y,1.8),(.36,d,2.8),.045)
    box(g,'white',(x,y,3.08),(w,d,.28),.055)
    box(g,'steel',(x,y+.18,.68),(2.85,2.4,.43),.07)
    # T slotted table and fixture clamps visible through the open front.
    box(g,'brushed',(x,y-.34,.98),(2.55,1.65,.16),.025)
    for dx in [-1.08+i*.18 for i in range(13)]: box(g,'darksteel',(x+dx,y-.34,1.064),(.034,1.6,.01))
    for dx in [-.8,.8]:
        box(g,'darksteel',(x+dx,y-.85,1.16),(.31,.24,.19),.02)
        bolt(g,(x+dx,y-.85,1.27),r=.035)
    # Column, twin guide rails, covered ballscrew and spindle head.
    box(g,'darksteel',(x,y+.9,1.75),(1.12,.7,2.25),.07)
    for dx in [-.4,.4]:
        box(g,'brushed',(x+dx,y+.47,1.88),(.12,.11,1.85),.015)
        for z in [1.1+i*.16 for i in range(10)]: bolt(g,(x+dx,y+.4,z),'y',.011)
    for z in [1.0+i*.035 for i in range(47)]: box(g,'black',(x,y+.49,z),(.58,.12,.014))
    box(g,'white',(x,y+.05,2.15),(.85,.8,1.0),.07)
    spindle(g,x,y-.34,1.95)
    # Side carousel with 16 tool pockets and cutting tools.
    cyl(g,'darksteel',(x+1.12,y+.48,2.06),(x+1.12,y+.31,2.06),.5,48)
    for a in range(16):
        th=2*math.pi*a/16; xx=x+1.12+.4*math.cos(th); zz=2.06+.4*math.sin(th)
        cyl(g,'brushed',(xx,y+.27,zz),(xx,y+.06,zz),.045,20)
        cyl(g,'black',(xx,y+.08,zz),(xx,y-.05,zz),.025,16)
    # Split door stowed on right, glass window, handle, linear guide, hinges.
    box(g,'darksteel',(x+1.1,y-1.83,1.84),(1.45,.16,2.36),.04)
    box(g,'glass',(x+1.08,y-1.925,2.06),(1.24,.045,1.39),.035)
    box(g,'white',(x+1.08,y-1.94,1.03),(1.27,.06,.45),.025)
    pipe(g,'brushed',[(x+.55,y-1.99,1.55),(x+.55,y-2.08,1.55),(x+.55,y-2.08,2.17),(x+.55,y-1.99,2.17)],.025,16)
    for z in [.57,3.07]: box(g,'steel',(x,y-1.83,z),(3.64,.11,.085),.02)
    for z in [1.25,2.5]: cyl(g,'steel',(x+1.85,y-1.85,z),(x+1.85,y-1.85,z+.17),.028,20)
    # Coolant nozzles and corrugated flexible lines.
    for dx in [-.37,.37]:
        pts=[(x+dx,y-.31,2.38),(x+dx*.8,y-.66,2.18),(x+dx*.4,y-.8,1.91)]
        pipe(g,'black',pts,.022,12)
        for k in range(13):
            p=Vector(pts[0]).lerp(Vector(pts[1]),k/13); cyl(g,'steel',p,p+Vector((0,-.014,-.008)),.029,16)
    # Side cabinet vent pattern, separated panels and bolted inspection covers.
    panel(g,(x-1.55,y-1.83,1.1),(.42,.06,.85),'white')
    for z in [.84+i*.052 for i in range(11)]: box(g,'darksteel',(x-1.55,y-1.87,z),(.3,.012,.014))
    hmi(g,x+1.59,y-2.06,2.12)
    cyl(g,'steel',(x+1.55,y+1.2,3.2),(x+1.55,y+1.2,3.45),.022,16)
    for z,t in [(3.45,'white'),(3.55,'glass'),(3.65,'white')]: cyl(g,t,(x+1.55,y+1.2,z),(x+1.55,y+1.2,z+.09),.055,24)
    label(g,'MC '+number+'  /  5-AXIS', (x-.55,y-1.79,2.89),.15,m='label')
    # Front sill with many fasteners, rear access cover and coolant line.
    for dx in [-1.5+i*.2 for i in range(16)]: bolt(g,(x+dx,y-1.79,.38),'y',.014)
    pipe(g,'black',[(x-1.3,y+1.74,.6),(x-1.3,y+1.78,2.55),(x-.6,y+1.78,2.55)],.025,12)

cnc('cnc_primary',0,3.15,'01')
cnc('cnc_secondary',-7.5,4.5,'02')
cnc('cnc_tertiary',7.5,4.5,'03')
# Work-target stock fixture table with 30 individually machined billets.
g='billet_fixture'
box(g,'darksteel',(-1.75,-.65,.43),(.85,1.1,.72),.04)
box(g,'brushed',(-1.75,-.65,.84),(1.05,1.3,.12),.025)
for xx in [-2.13,-1.37]:
    for yy in [-1.15,-.15]: foot(g,xx,yy,.4)
for i in range(5):
    for j in range(6):
        x=-2.12+i*.185; y=-1.15+j*.2
        cyl(g,'darksteel',(x,y,.9),(x,y,.92),.073,24)
        cyl(g,'brushed',(x,y,.925),(x,y,1.095),.061,32)
        cyl(g,'darksteel',(x,y,1.095),(x,y,1.098),.031,24)
label(g,'BLANKS / 30 PCS',(-1.75,-1.31,.57),.085)
# Chip disposal systems with ribbed belt, inclined chute and removable bin.
def chips(g,x,y):
    box(g,'darksteel',(x,y,.27),(1.6,.75,.34),.025)
    for i in range(20): box(g,'steel',(x-.7+i*.075,y,.45),(.025,.65,.06))
    pipe(g,'steel',[(x+.75,y,.35),(x+1.25,y,.9),(x+1.5,y,.9)],.15,8)
    box(g,'steel',(x+1.5,y,.38),(.75,.7,.72),.04)
    box(g,'black',(x+1.5,y,.756),(.63,.59,.035))
    for i in range(80):
        xx=x+1.5+random.uniform(-.27,.27); yy=y+random.uniform(-.25,.25)
        cyl(g,'brushed',(xx,yy,.78),(xx+random.uniform(-.07,.07),yy+random.uniform(-.08,.08),.79),.005,6)
    for dx in [-.26,.26]:
        for dy in [-.24,.24]: cyl(g,'rubber',(x+1.5+dx,y+dy-.025,.065),(x+1.5+dx,y+dy+.025,.065),.065,20)
for n,(x,y) in enumerate([(-2.7,3.9),(-10.2,5.25),(4.8,5.25)]): chips('chip_bin_'+str(n+1),x,y)
# Robot controller, independent of the CNC HMI, used as actual candidate C obstacle.
g='robot_controller'
box(g,'white',(3.7,-1.7,.89),(1.05,.68,1.7),.055)
box(g,'darksteel',(3.7,-1.7,.045),(1.2,.83,.09),.02)
panel(g,(3.7,-2.06,.91),(.91,.05,1.5),'steel')
hmi(g,3.7,-2.12,1.39)
for z in [.38+i*.05 for i in range(8)]: box(g,'black',(3.7,-2.1,z),(.68,.017,.021))
for x in [3.25,4.15]:
    for y in [-1.93,-1.47]: foot(g,x,y,.15)
# Coolant filtration skids and air receiver; visible valves, ducts, gauges.
for idx,(x,y) in enumerate([(-4.2,6.9),(4.5,6.9)]):
    g='coolant_'+str(idx+1)
    box(g,'darksteel',(x,y,.14),(2.0,1.1,.25),.025)
    box(g,'steel',(x,y,.57),(1.85,1.0,.6),.05)
    for dx in [-.65,.65]:
        cyl(g,'steel',(x+dx,y,.9),(x+dx,y,1.55),.21,32)
        for z in [.98,1.45]: cyl(g,'darksteel',(x+dx,y,z),(x+dx,y,z+.035),.23,32)
        pipe(g,'black',[(x+dx,y,1.6),(x+dx,y-.45,1.6),(x,y-.45,1.6)],.035,12)
        cyl(g,'white',(x+dx,y-.21,1.2),(x+dx,y-.25,1.2),.07,24)
        pipe(g,'black',[(x+dx,y-.258,1.2),(x+dx+.035,y-.258,1.225)],.006,6)
    for i in range(10): box(g,'darksteel',(x-.7+i*.15,y,.885),(.018,.86,.016))
# Stock bar rack along the left wall.
g='bar_stock_rack'
for x in [-12,-10.6]:
    for y in [-1.8,2.6]:
        box(g,'darksteel',(x,y,1.7),(.1,.11,3.4))
        box(g,'steel',(x,y,.06),(.26,.3,.12),.02)
for z in [.45,1.3,2.15,3.0]:
    for x in [-12,-10.6]: box(g,'steel',(x,.4,z),(.14,4.65,.1))
    for j in range(9):
        x=-11.94+j*.165
        cyl(g,'brushed',(x,-1.65,z+.09),(x,2.55,z+.09),.057+(j%3)*.007,20)
for y in [-1.8,2.6]: pipe(g,'steel',[(-12,y,.5),(-10.6,y,2.7)],.028,8)
# Tooling cabinets with 8 drawers, pull handles and top plate.
def drawers(g,x,y):
    box(g,'darksteel',(x,y,.65),(1.55,.8,1.25),.025)
    for z in [.18+i*.14 for i in range(8)]:
        box(g,'steel',(x,y-.42,z),(1.43,.05,.12),.012)
        box(g,'darksteel',(x,y-.475,z),(.73,.045,.021),.006)
        box(g,'white',(x-.58,y-.452,z),(.18,.008,.045))
    box(g,'brushed',(x,y,1.31),(1.65,.89,.08),.025)
    for i in range(10):
        cyl(g,'steel',(x-.62+i*.14,y,1.35),(x-.62+i*.14,y,1.57),.035,20)
for idx,(x,y) in enumerate([(-7.9,-.7),(-5.5,7.6),(8.5,-1.2)]): drawers('tool_cabinet_'+str(idx+1),x,y)
# Metrology surface plate, fixture probes and a bridge CMM.
g='metrology'
box(g,'darksteel',(8.4,-3.35,.47),(2.45,1.4,.85),.06)
box(g,'black',(8.4,-3.35,.96),(2.65,1.6,.18),.03)
for x in [7.37,9.43]:
    box(g,'white',(x,-3.35,1.57),(.22,1.5,1.24),.04)
    box(g,'steel',(x,-3.35,2.18),(.24,1.45,.16),.025)
box(g,'brushed',(8.4,-3.25,2.23),(2.35,.3,.19),.035)
box(g,'white',(8.5,-3.25,2.01),(.35,.45,.5),.045)
cyl(g,'steel',(8.5,-3.25,1.85),(8.5,-3.25,1.32),.025,24)
cyl(g,'darksteel',(8.5,-3.25,1.35),(8.5,-3.25,1.2),.008,12)
for i in range(5): cyl(g,'brushed',(7.75+i*.3,-3.2,1.05),(7.75+i*.3,-3.2,1.18),.09,24)
g='air_receiver'
cyl(g,'steel',(11.5,7.2,.3),(11.5,7.2,2.7),.5,48)
for z in [.38,2.57]: cyl(g,'darksteel',(11.5,7.2,z),(11.5,7.2,z+.06),.52,40)
for dx in [-.35,.35]: foot(g,11.5+dx,7.2,.35)
pipe(g,'steel',[(11.5,7.2,2.73),(11.5,7.2,3.05),(12.5,7.2,3.05),(12.5,7.2,.3)],.04,16)
cyl(g,'white',(11.5,6.7,2.05),(11.5,6.64,2.05),.12,32)
pipe(g,'black',[(11.5,6.635,2.05),(11.57,6.635,2.08)],.008,8)
# Wheeled job cart with casting trays.
g='job_cart'
for z in [.25,.72,1.18]:
    box(g,'steel',(-8.8,-3.25,z),(1.3,.72,.055),.02)
    for i in range(5):
        box(g,'darksteel',(-9.28+i*.24,-3.25,z+.09),(.18,.35,.12),.02)
        cyl(g,'brushed',(-9.28+i*.24,-3.25,z+.15),(-9.28+i*.24,-3.25,z+.24),.062,24)
for x in [-9.35,-8.25]:
    for y in [-3.52,-2.98]:
        cyl(g,'steel',(x,y,.15),(x,y,1.28),.022,16)
        cyl(g,'rubber',(x,y-.03,.11),(x,y+.03,.11),.10,24)
pipe(g,'steel',[(-9.45,-3.53,1.18),(-9.65,-3.53,1.38),(-9.65,-2.97,1.38),(-9.45,-2.97,1.18)],.025,16)
# Distinct mesh fence sections are real collision obstacles; entry gate stays open.
def fence(g,a,b,h=2.15):
    a,b=Vector((*a,0)),Vector((*b,0)); length=(b-a).length; u=(b-a).normalized(); count=max(1,int(length/1.8))
    for i in range(count+1):
        p=a+(b-a)*i/count
        box(g,'darksteel',(p.x,p.y,h/2),(.075,.075,h),.009)
        box(g,'steel',(p.x,p.y,.035),(.21,.21,.07),.009)
        for dx in [-.065,.065]: bolt(g,(p.x+dx,p.y,.078),r=.014)
    for z in [.2,h-.12]: pipe(g,'steel',[(a.x,a.y,z),(b.x,b.y,z)],.022,8)
    for i in range(int(length/.11)+1):
        p=a+u*(i*.11); cyl(g,'darksteel',(p.x,p.y,.24),(p.x,p.y,h-.16),.0055,6)
    for z in [.3+i*.11 for i in range(int((h-.5)/.11))]: pipe(g,'darksteel',[(a.x,a.y,z),(b.x,b.y,z)],.0055,6)
fence('fence_left',(-4.75,-3.45),(-4.75,5.4))
fence('fence_right',(4.8,-3.45),(4.8,4.6))
fence('fence_front_left',(-4.75,-3.45),(-1.2,-3.45))
fence('fence_front_right',(1.4,-3.45),(4.8,-3.45))
# Air/filtration unit bank with louvers and bolted panel detail.
g='extraction_unit'
box(g,'white',(11.7,2.25,1.42),(1.5,1.65,2.8),.055)
for z in [.35+i*.075 for i in range(26)]: box(g,'darksteel',(11.7,1.41,z),(1.28,.018,.029))
for dx in [-.55,.55]:
    for z in [.22,1.35,2.65]: bolt(g,(11.7+dx,1.397,z),'y',.018)
pipe('hvac','steel',[(11.7,2.25,2.85),(11.7,2.25,4.7),(8,2.25,4.7)],.23,24)
for x in [8+i*.3 for i in range(13)]: cyl('hvac','darksteel',(x,2.25,4.7),(x+.035,2.25,4.7),.244,24)
# Service loading door and pallet storage in the far aisle.
box('envelope','darksteel',(-10,9.83,1.75),(3.2,.18,3.5))
for z in [.12+i*.15 for i in range(23)]: box('envelope','steel',(-10,9.7,z),(3.0,.09,.125),.009)
label('envelope','MATERIAL IN',(-10,9.66,3.6),.2)
for n,(x,y) in enumerate([(-11,-8.5),(-8.7,-8.5),(10.8,-7.6)]):
    g='castings_pallet_'+str(n+1)
    for yy in [-.46,0,.46]: box(g,'darksteel',(x,y+yy,.09),(1.4,.16,.18),.012)
    for j in range(7): box(g,'steel',(x-.61+j*.2,y,.2),(.16,1.1,.055),.006)
    for i in range(4):
        for j in range(3):
            xx=x-.46+i*.3; yy=y-.32+j*.32
            box(g,'brushed',(xx,yy,.39),(.24,.24,.32),.03)
            cyl(g,'darksteel',(xx,yy,.552),(xx,yy,.555),.07,24)
# Texture by geometry: fasteners on all machine panel seams; moderate batching.
for gx,gy,group in [(0,3.15,'cnc_primary'),(-7.5,4.5,'cnc_secondary'),(7.5,4.5,'cnc_tertiary')]:
    for z in [.58,1.08,1.58,2.08,2.58,3.02]:
        for dx in [-1.86,1.86]:
            for yy in [-1.45,-.8,0,.8,1.45]:
                # external X-facing flange stud with a concentric washer
                x=gx+dx; y=gy+yy
                cyl(group,'brushed',(x-.008,y,z),(x+.008,y,z),.023,20)
                cyl(group,'darksteel',(x-.012,y,z),(x+.012,y,z),.014,6)
factory_obs=flush(factory)
bpy.context.view_layer.update()
# Original MT-2200: angular, heavy machine-tending arm with dual parallel jaw tooling.
root=bpy.data.objects.new('MT2200_Robot_Root',None); robotcol.objects.link(root)
root['model']='MT-2200 original concept machine-tending robot'; root['reach_m']=2.2; root['payload_kg']=25
root['source']='Original procedural virtual model, not OEM CAD or certified dimensions'
pivots={'MT_J1_Base':(0,0,.36),'MT_J2_Shoulder':(0,0,.83),'MT_J3_Elbow':(-.63,0,1.89),'MT_J4_Forearm':(-.88,0,1.96),'MT_J5_Wrist':(-1.47,0,1.88),'MT_J6_Tool':(-1.65,0,1.57)}
axes=['Z','Y','Y','X','Y','Z']; J={'root':root}; previous=root
for i,(name,pos) in enumerate(pivots.items()):
    ob=bpy.data.objects.new(name,None); robotcol.objects.link(ob); ob.location=pos
    bpy.context.view_layer.update(); w=ob.matrix_world.copy(); ob.parent=previous; ob.matrix_world=w
    ob['joint_index']=i+1; ob['joint_axis_blender']=axes[i]; ob['motion_amplitude']=.055 if i<3 else .07
    J[name]=ob; previous=ob
box('base','darksteel',(0,0,.07),(.84,.84,.14),.06)
for xx in [-.32,.32]:
    for yy in [-.32,.32]:
        cyl('base','brushed',(xx,yy,.14),(xx,yy,.16),.065,24)
        bolt('base',(xx,yy,.18),r=.039)
cyl('base','steel',(0,0,.14),(0,0,.35),.34,64,r2=.28)
cyl('base','black',(0,0,.35),(0,0,.39),.29,64)
for a in range(24):
    theta=a*math.pi/12; bolt('base',(.27*math.cos(theta),.27*math.sin(theta),.335),r=.013)
cyl('MT_J1_Base','white',(0,0,.39),(0,0,.59),.275,56,r2=.225)
box('MT_J1_Base','white',(.015,0,.64),(.43,.52,.4),.065)
box('MT_J1_Base','darksteel',(.13,.23,.61),(.37,.19,.31),.035)
for z in [.5+i*.038 for i in range(6)]: box('MT_J1_Base','black',(.15,.331,z),(.25,.013,.013))

def rjoint(g,p,r=.22,length=.52):
    x,y,z=p
    cyl(g,'darksteel',(x,y-length/2,z),(x,y+length/2,z),r,56)
    for sign in [-1,1]:
        yy=y+sign*(length/2+.005)
        cyl(g,'steel',(x,yy,z),(x,yy+sign*.025,z),r*.98,56)
        cyl(g,'white',(x,yy+sign*.025,z),(x,yy+sign*.075,z),r*.85,48)
        cyl(g,'black',(x,yy+sign*.075,z),(x,yy+sign*.08,z),r*.58,40)
        cyl(g,'brushed',(x,yy+sign*.08,z),(x,yy+sign*.089,z),r*.39,32)
        for a in range(12):
            th=math.pi*2*a/12
            cyl(g,'brushed',(x+r*.71*math.cos(th),yy+sign*.075,z+r*.71*math.sin(th)),(x+r*.71*math.cos(th),yy+sign*.082,z+r*.71*math.sin(th)),.021,16)
            bolt(g,(x+r*.71*math.cos(th),yy+sign*.09,z+r*.71*math.sin(th)),'y',.012)

def arm(g,a,b,w1=.34,w2=.25,thick=.34):
    a,b=Vector(a),Vector(b); u=(b-a).normalized(); perp=Vector((u.z,0,-u.x))
    pts=[a+perp*w1/2,a-perp*w1/2,b-perp*w2/2,b+perp*w2/2]
    vs=[tuple(p+Vector((0,sign*thick/2,0))) for sign in [-1,1] for p in pts]
    addgeom(g,'white',vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
    for sign in [-1,1]:
        aa=a+u*.13; bb=b-u*.13; aa.y=bb.y=sign*(thick/2+.008)
        # Dark recessed side panel follows the tapered cast link.
        pv=[aa+perp*w2*.28,aa-perp*w2*.28,bb-perp*w2*.22,bb+perp*w2*.22]
        addgeom(g,'darksteel',[tuple(p) for p in pv],[(0,1,2,3)])
        for t in [.12,.35,.65,.88]:
            p=a.lerp(b,t); p.y=sign*(thick/2+.015)
            for s in [-1,1]: bolt(g,p+perp*w2*.31*s,'y',.012)
        pipe(g,'brushed',[tuple(aa+perp*w2*.35),tuple(bb+perp*w2*.29)],.013,12)
    for t in [.28,.45,.62,.78]:
        p=a.lerp(b,t)+perp*w2*.5
        cyl(g,'steel',p+Vector((0,-thick/2,0)),p+Vector((0,thick/2,0)),.018,12)
rjoint('MT_J2_Shoulder',(0,0,.83),.27,.55)
arm('MT_J2_Shoulder',(0,0,.86),(-.63,0,1.89),.37,.3,.39)
rjoint('MT_J3_Elbow',(-.63,0,1.89),.235,.48)
arm('MT_J3_Elbow',(-.64,0,1.9),(-.9,0,1.96),.29,.26,.35)
arm('MT_J4_Forearm',(-.88,0,1.96),(-1.47,0,1.88),.27,.19,.3)
cyl('MT_J4_Forearm','darksteel',(-.88,0,1.96),(-1.02,0,1.941),.181,48)
for x in [-.88-i*.033 for i in range(5)]: cyl('MT_J4_Forearm','brushed',(x,0,1.96+(x+.88)*.135),(x-.009,0,1.96+(x+.889)*.135),.186,48)
rjoint('MT_J5_Wrist',(-1.47,0,1.88),.16,.36)
arm('MT_J5_Wrist',(-1.47,0,1.86),(-1.65,0,1.57),.2,.16,.24)
cyl('MT_J6_Tool','darksteel',(-1.65,0,1.62),(-1.65,0,1.44),.135,48)
cyl('MT_J6_Tool','brushed',(-1.65,0,1.45),(-1.65,0,1.41),.16,48)
for a in range(12):
    th=a*math.pi/6; bolt('MT_J6_Tool',(-1.65+.13*math.cos(th),.13*math.sin(th),1.417),r=.011)
# Two independent jaw tools, opening in orthogonal directions for billet handoff.
box('MT_J6_Tool','steel',(-1.65,0,1.355),(.23,.54,.12),.022)
for yy in [-.18,.18]:
    box('MT_J6_Tool','darksteel',(-1.65,yy,1.265),(.28,.21,.11),.015)
    for xx in [-1.765,-1.535]:
        box('MT_J6_Tool','brushed',(xx,yy,1.155),(.065,.17,.15),.011)
        box('MT_J6_Tool','black',(xx+(.028 if xx<-1.65 else -.028),yy,1.12),(.018,.14,.065),.004)
        for off in [-.05,.05]: bolt('MT_J6_Tool',(xx,yy+off,1.205),r=.012)
    for z in [1.26,1.28]: cyl('MT_J6_Tool','brushed',(-1.8,yy,z),(-1.5,yy,z),.012,16)
    pipe('MT_J6_Tool','black',[(-1.65,yy,1.33),(-1.83,yy,1.34),(-1.83,yy,1.5)],.014,12)
cyl('MT_J6_Tool','brushed',(-1.65,-.18,1.09),(-1.65,-.18,1.21),.059,32)
# Large corrugated dress-pack, clamps, brake connectors and electrical motor ribs.
cables=[('MT_J1_Base',[(.18,.25,.37),(.26,.29,.57),(.2,.31,.91)]),('MT_J2_Shoulder',[(.17,.32,.9),(.12,.33,1.1),(-.22,.3,1.7),(-.54,.3,2.03)]),('MT_J3_Elbow',[(-.54,.27,2.06),(-.67,.27,2.2),(-.95,.24,2.13)]),('MT_J4_Forearm',[(-.95,.22,2.1),(-1.14,.23,2.1),(-1.43,.2,2.02)]),('MT_J5_Wrist',[(-1.44,.19,2.02),(-1.66,.2,1.84),(-1.78,.16,1.63)]),('MT_J6_Tool',[(-1.78,.16,1.62),(-1.82,.14,1.46),(-1.72,.1,1.38)])]
for g,pts in cables:
    pipe(g,'black',pts,.033,16)
    pipe(g,'steel',[(x,y+.044,z) for x,y,z in pts],.009,10)
    for i in range(len(pts)-1):
        a,b=Vector(pts[i]),Vector(pts[i+1]); count=max(1,int((b-a).length/.019)); u=(b-a).normalized()
        for k in range(count):
            p=a.lerp(b,(k+.5)/count); cyl(g,'rubber',p-u*.006,p+u*.006,.039,16)
    for p in [Vector(pts[0]),Vector(pts[-1])]:
        box(g,'brushed',p,(.1,.07,.08),.012)
        bolt(g,p+Vector((0,.05,0)),'y',.013)
# Shoulder servo motor with a separate cooling rib stack.
cyl('MT_J2_Shoulder','darksteel',(0,.36,.83),(0,.69,.83),.18,40)
for yy in [.38+i*.026 for i in range(12)]: cyl('MT_J2_Shoulder','steel',(0,yy,.83),(0,yy+.012,.83),.187,40)
box('MT_J2_Shoulder','black',(.06,.58,1.03),(.15,.18,.1),.025)
robot_obs=flush(robotcol)
for ob in robot_obs:
    parent=J.get(ob['equipment_id'],root)
    bpy.context.view_layer.update(); w=ob.matrix_world.copy(); ob.parent=parent; ob.matrix_world=w
bpy.context.view_layer.update()
# Export just each owned collection, with extras for viewer joints/equipment layers.
def enum_value(owner,prop,value):
    items=owner.bl_rna.properties[prop].enum_items
    available={item.identifier for item in items}
    if value not in available: raise RuntimeError('Unsupported enum %s=%s; available %s'%(prop,value,sorted(available)))
    return value

def export_glb(path,collection):
    for ob in scene.objects: ob.select_set(False)
    for ob in collection.all_objects: ob.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(collection.all_objects))
    export_enum={item[0] for item in io_scene_gltf2.get_format_items(None, bpy.context)}
    if 'GLB' not in export_enum: raise RuntimeError('GLB export unavailable')
    bpy.ops.export_scene.gltf(filepath=path,export_format='GLB',use_selection=True,use_active_scene=True,export_extras=True,export_yup=True,export_apply=True,export_cameras=False,export_lights=False)
export_glb(os.path.join(OUT,'factory.glb'),factory)
export_glb(os.path.join(OUT,'robot.glb'),robotcol)
# Derive all collision rectangles from the actual factory meshes, excluding architecture.
ignored={'hall','floor','envelope','structure','windows','hvac','utilities','lighting','traffic','drain'}
group_bounds={}
for ob in factory_obs:
    g=ob['equipment_id']
    if g in ignored: continue
    bb=[ob.matrix_world@Vector(p) for p in ob.bound_box]
    lo=Vector((min(p.x for p in bb),min(p.y for p in bb),min(p.z for p in bb)))
    hi=Vector((max(p.x for p in bb),max(p.y for p in bb),max(p.z for p in bb)))
    if g in group_bounds:
        oldlo,oldhi=group_bounds[g]; lo=Vector(tuple(min(lo[i],oldlo[i]) for i in range(3))); hi=Vector(tuple(max(hi[i],oldhi[i]) for i in range(3)))
    group_bounds[g]=(lo,hi)
names={'cnc_primary':'CNC 01 · 로봇 로딩 가공기','cnc_secondary':'CNC 02 · 후공정 가공기','cnc_tertiary':'CNC 03 · 보조 가공기','billet_fixture':'소재 공급 지그 · 원통 빌릿 30개','robot_controller':'MT-2200 로봇 제어반','bar_stock_rack':'봉재 보관 랙','metrology':'브리지 정밀 측정기','air_receiver':'압축 공기 리시버','job_cart':'가공품 이동 카트','extraction_unit':'미스트 집진기','fence_left':'셀 좌측 안전 펜스','fence_right':'셀 우측 안전 펜스','fence_front_left':'출입구 좌측 펜스','fence_front_right':'출입구 우측 펜스'}
equipment=[]
for g,(lo,hi) in group_bounds.items():
    name=names.get(g)
    if not name:
        if g.startswith('chip_bin_'): name='칩 이송·수거 장치 '+g[-1]
        elif g.startswith('coolant_'): name='냉각수 여과 스키드 '+g[-1]
        elif g.startswith('tool_cabinet_'): name='공구 서랍 캐비닛 '+g[-1]
        elif g.startswith('castings_pallet_'): name='주조품 적재 팔레트 '+g[-1]
        else: name=g
    equipment.append({'id':g,'name':name,'category':'안전 펜스' if 'fence' in g else '생산 설비','footprint':{'kind':'rect','center':{'x':round((lo.x+hi.x)/2,5),'y':round((lo.y+hi.y)/2,5)},'width':round(hi.x-lo.x,5),'depth':round(hi.y-lo.y,5)},'blocksBase':True,'sweepPolicy':'work-target' if g in ['cnc_primary','billet_fixture'] else 'advisory'})

def triangles(obs):
    count=0
    for ob in obs:
        if ob.type=='MESH': ob.data.calc_loop_triangles(); count+=len(ob.data.loop_triangles)
    return count
layout={'slug':'metal-machining','title':'정밀 금속 가공 · 머신텐딩','shortTitle':'금속 가공','industry':'정밀 가공','description':'철골 크레인 홀의 CNC 3대와 빌릿 공급 지그, 칩 이송·냉각수 여과 설비를 연결하는 머신텐딩 셀입니다. 듀얼 죠 그리퍼가 소재 투입과 가공품 반출을 수행하는 배치를 비교합니다.','robotDescription':'6축 머신텐딩 로봇 · 듀얼 죠 그리퍼 · 가상 제원',
'scenario':{'schemaVersion':'1.0','id':'metal-machining-v1','name':'정밀 금속 가공 · CNC 머신텐딩 셀','factory':{'width':28,'depth':20,'center':{'x':0,'y':0}},'cell':{'kind':'rect','center':{'x':.2,'y':.8},'width':10,'depth':9.8},'robot':{'name':'MT-2200','reach':2.2,'footprintDiameter':1.19,'safetyBuffer':.35,'payloadKg':25},'targets':[{'id':'pick','name':'빌릿 공급 지그','position':{'x':-1.75,'y':-.65},'equipmentId':'billet_fixture'},{'id':'place','name':'CNC 로딩 입구','position':{'x':0,'y':1.5},'equipmentId':'cnc_primary'}],'equipment':equipment,'candidates':[{'id':'A','name':'중앙 머신텐딩','position':{'x':0,'y':-.3},'description':'소재 공급 지그와 CNC 로딩 입구 사이의 중앙 배치'},{'id':'B','name':'통로 방향 이동','position':{'x':2,'y':-1.2},'description':'유지보수 접근은 넓어지지만 공급 지그까지 작업 도달 거리가 증가하는 배치'},{'id':'C','name':'제어반 간섭 배치','position':{'x':3.7,'y':-1.7},'description':'실제 로봇 제어반과 베이스가 겹치는 간섭 검토용 배치'}],'pathways':[{'id':'worker','name':'작업자 셀 접근 동선','kind':'worker','width':1.2,'points':[{'x':-12,'y':-4.35},{'x':0,'y':-4.35},{'x':0,'y':-2.4}]},{'id':'cart','name':'소재 운반 카트 통로','kind':'cart','width':1.8,'points':[{'x':-12.5,'y':-6.2},{'x':0,'y':-6.2},{'x':12.5,'y':-6.2}]}],'roi':{'investment':145000000,'workersBefore':2,'workersAfter':1,'hoursPerDay':16,'daysPerMonth':22,'hourlyWage':24000,'monthlyMaintenance':720000}},'camera':{'cellOffset':[4.8,4.2,6.2],'targetHeight':1.25,'overviewPosition':[27,25,32]},'stats':{'factoryTriangles':triangles(factory_obs),'robotTriangles':triangles(robot_obs),'factoryMeshes':len(factory_obs),'robotMeshes':len(robot_obs)},'provenance':'Original Blender MCP procedural virtual testbed; not measured plant/OEM CAD'}
with open(os.path.join(OUT,'layout.json'),'w') as f: json.dump(layout,f,ensure_ascii=False,indent=2)
# Render-ready scene presentation, separate from standalone GLB origin.
root.location=(0,-.3,0)
world=bpy.data.worlds.new('METAL_Neutral_World'); world.use_nodes=True
background=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND'); background.inputs['Color'].default_value=(.32,.32,.32,1); background.inputs['Strength'].default_value=.48; scene.world=world
camdata=bpy.data.cameras.new('METAL_Overview_Camera'); cam=bpy.data.objects.new('METAL_Overview_Camera',camdata); studio.objects.link(cam); scene.camera=cam
cam.location=(23,-29,23); target=Vector((-.6,1.0,1.3)); cam.rotation_euler=(target-Vector(cam.location)).to_track_quat('-Z','Y').to_euler(); camdata.type=enum_value(camdata,'type','ORTHO'); camdata.ortho_scale=36
for i,(pos,energy,size) in enumerate([((2,-8,17),6000,12),((-11,-3,12),4200,10),((5,10,15),6200,9)]):
    lighttypes={p.identifier for p in bpy.types.Light.bl_rna.properties['type'].enum_items}
    if 'AREA' not in lighttypes: raise RuntimeError('AREA lighting unavailable')
    data=bpy.data.lights.new('METAL_Area_'+str(i),type='AREA'); data.energy=energy; data.shape=enum_value(data,'shape','DISK'); data.size=size; data.color=(1,1,1)
    ob=bpy.data.objects.new(data.name,data); studio.objects.link(ob); ob.location=pos; ob.rotation_euler=(Vector((0,0,1))-Vector(pos)).to_track_quat('-Z','Y').to_euler()
current_engine=scene.render.engine
render_engines={e.identifier for e in scene.render.bl_rna.properties['engine'].enum_items}
try:
    if current_engine != 'BLENDER_EEVEE':
        if 'BLENDER_EEVEE' not in render_engines: raise TypeError('EEVEE not in current RNA enum')
        scene.render.engine='BLENDER_EEVEE'
except TypeError:
    engines={e.identifier for e in scene.render.bl_rna.properties['engine'].enum_items}
    if 'CYCLES' in engines: scene.render.engine='CYCLES'; scene.cycles.samples=24
scene.render.resolution_x=1200; scene.render.resolution_y=750; scene.render.resolution_percentage=100
scene.render.image_settings.file_format=enum_value(scene.render.image_settings,'file_format','PNG')
scene.render.filepath=os.path.join(OUT,'thumbnail.png'); scene.render.film_transparent=False
scene['robospace_slug']='metal-machining'; scene['provenance']=layout['provenance']
bpy.context.view_layer.update()
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_distance=26
        area.spaces.active.region_3d.view_location=Vector((0,0,1))
        area.spaces.active.region_3d.view_rotation=cam.rotation_euler.to_quaternion()
bpy.data.libraries.write(os.path.join(OUT,'scene.blend'),{scene},fake_user=True,compress=True)
print('METAL_FACTORY_READY',json.dumps({'stats':layout['stats'],'colliders':len(equipment),'factoryBytes':os.path.getsize(os.path.join(OUT,'factory.glb')),'robotBytes':os.path.getsize(os.path.join(OUT,'robot.glb')),'scene':scene.name}))
