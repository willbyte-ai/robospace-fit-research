import bpy, math, json, os, random
import io_scene_gltf2
from mathutils import Vector
from collections import defaultdict
random.seed(71)
OUT='/tmp/robospace-scenarios/logistics-sortation'
os.makedirs(OUT, exist_ok=True)
scene=bpy.data.scenes.new('RoboSpace_Logistics_Sortation_Highbay_32x22')
bpy.context.window.scene=scene
unit_systems=[e.identifier for e in scene.unit_settings.bl_rna.properties['system'].enum_items]
assert 'METRIC' in unit_systems
scene.unit_settings.system='METRIC'
factory=bpy.data.collections.new('LOGISTICS_FACTORY_32x22'); scene.collection.children.link(factory)
robotcol=bpy.data.collections.new('LOGISTICS_ROBOT_LP2800'); scene.collection.children.link(robotcol)
studio=bpy.data.collections.new('LOGISTICS_STUDIO'); scene.collection.children.link(studio)
M={}
def mat(name,v,metal=0,rough=.45,emit=0):
    m=bpy.data.materials.new('LG_'+name); m.diffuse_color=(v,v,v,1); m.use_nodes=True
    bs=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    bs.inputs['Base Color'].default_value=(v,v,v,1); bs.inputs['Metallic'].default_value=metal; bs.inputs['Roughness'].default_value=rough
    if emit: bs.inputs['Emission Color'].default_value=(v,v,v,1); bs.inputs['Emission Strength'].default_value=emit
    M[name]=m
for a in [('floor',.26,.08,.64),('concrete',.36,0,.78),('wall',.55,.12,.56),('white',.76,.25,.35),('steel',.39,.8,.28),('brushed',.59,.76,.36),('darksteel',.065,.72,.34),('black',.016,.15,.52),('rubber',.025,0,.73),('card',.47,0,.86),('card2',.34,0,.88),('tape',.66,.05,.64),('wood',.25,0,.82),('label',.86,0,.65),('ink',.04,0,.6),('glass',.12,.4,.15),('light',.95,.05,.2,3)]: mat(*a)
B=defaultdict(lambda:[[],[],[]])
def geom(g,m,vs,fs,smooth=False):
    v,f,s=B[(g,m)]; n=len(v); v.extend(vs); f.extend([tuple(n+i for i in a) for a in fs]); s.extend([smooth]*len(fs))
def box(g,m,p,s,bevel=0,rot=0):
    x,y,z=[d/2 for d in s]; r=min(bevel,x*.7,y*.7,z*.7)
    if r:
        ring=[(-x+r,-y),(x-r,-y),(x,-y+r),(x,y-r),(x-r,y),(-x+r,y),(-x,y-r),(-x,-y+r)]
        vs=[(a,b,c) for c in [-z,z] for a,b in ring]; fs=[tuple(reversed(range(8))),tuple(range(8,16))]+[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
    else:
        vs=[(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)]
        fs=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
    c,t=math.cos(rot),math.sin(rot); geom(g,m,[(p[0]+a*c-b*t,p[1]+a*t+b*c,p[2]+d) for a,b,d in vs],fs)
def cyl(g,m,a,b,r,n=16,r2=None):
    a,b=Vector(a),Vector(b); q=(b-a).to_track_quat('Z','Y'); rr=r if r2 is None else r2
    vs=[tuple(p+q@Vector((rad*math.cos(2*math.pi*i/n),rad*math.sin(2*math.pi*i/n),0))) for p,rad in [(a,r),(b,rr)] for i in range(n)]
    geom(g,m,vs,[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],True)
def pipe(g,m,ps,r=.02,n=10):
    for a,b in zip(ps,ps[1:]): cyl(g,m,a,b,r,n)
def bolt(g,p,axis='Z',r=.018):
    d=Vector((0,0,.012) if axis=='Z' else (0,.012,0)); cyl(g,'darksteel',Vector(p)-d,Vector(p)+d,r,6)
def text(g,body,p,size=.2):
    cv=bpy.data.curves.new('LG_Label_'+body,'FONT'); cv.body=body; cv.size=size
    alignments=[e.identifier for e in cv.bl_rna.properties['align_x'].enum_items]
    assert 'CENTER' in alignments
    cv.align_x='CENTER'; cv.extrude=.0004
    ob=bpy.data.objects.new(g+'__Label_'+body,cv); factory.objects.link(ob); ob.location=p; ob.rotation_euler=(math.pi/2,0,0); cv.materials.append(M['label']); ob['equipment_id']=g
def flush(col):
    obs=[]
    for (g,m),(vs,fs,sm) in list(B.items()):
        if not vs: continue
        me=bpy.data.meshes.new('LG_'+g+'__'+m); me.from_pydata(vs,[],fs); me.materials.append(M[m]); me.update()
        ob=bpy.data.objects.new('LG_'+g+'__'+m,me); col.objects.link(ob); ob['equipment_id']=g
        for p,s in zip(me.polygons,sm): p.use_smooth=s
        obs.append(ob)
    B.clear(); return obs
def foot(g,x,y,z):
    cyl(g,'steel',(x,y,.06),(x,y,z),.035,12); cyl(g,'rubber',(x,y,.01),(x,y,.06),.082,16)
    cyl(g,'darksteel',(x,y,.1),(x,y,.135),.048,6)
def carton(g,x,y,z,s=(.56,.4,.38),alt=0):
    w,d,h=s; box(g,'card2' if alt else 'card',(x,y,z+h/2),s,.018)
    box(g,'tape',(x,y,z+h+.004),(w,.06,.008)); box(g,'label',(x,y-d/2-.004,z+h*.56),(.19,.007,.12))
    for i in range(8): box(g,'ink',(x-.071+i*.02,y-d/2-.009,z+h*.56),(.004+(i%2)*.003,.004,.071))
    for xx in [-w*.3,w*.3]: box(g,'ink',(x+xx,y-d/2-.006,z+.06),(.042,.006,.013))
def pallet(g,x,y,z=0,loaded=0):
    for yy in [-.43,0,.43]:
        for xx in [-.49,0,.49]: box(g,'wood',(x+xx,y+yy,z+.07),(.16,.16,.12),.006)
        box(g,'wood',(x,y+yy,z+.012),(1.2,.15,.024))
    for i in range(7):
        xx=x-.52+i*.174; box(g,'wood',(xx,y,z+.148),(.148,1.02,.036),.005)
        for yy in [-.4,0,.4]: bolt(g,(xx,y+yy,z+.17),r=.007)
    if loaded:
        for layer in range(2):
            for xx in [-.29,.29]:
                for yy in [-.31,.10]: carton(g,x+xx,y+yy,z+.17+layer*.40,(.55,.39,.39),(layer+int(x))%2)
        for xx in [-.36,.36]: box(g,'darksteel',(x+xx,y-.514,z+.6),(.018,.01,.85))
def hmi(g,x,y,z):
    box(g,'darksteel',(x,y,z),(.45,.11,.34),.022); box(g,'glass',(x-.045,y-.061,z+.025),(.30,.012,.22),.012)
    for i in range(4): box(g,'label',(x-.08,y-.07,z+.1-i*.043),(.15-i*.02,.008,.009))
    for dz in [-.1,.04]: cyl(g,'white',(x+.155,y-.058,z+dz),(x+.155,y-.087,z+dz),.033,16)
def conveyor(g,x,y,l,w=1.0,z=.8):
    for yy in [y-w/2,y+w/2]:
        box(g,'steel',(x,yy,z-.10),(l,.08,.20),.02); box(g,'darksteel',(x,yy,z+.08),(l,.035,.03))
    for i in range(int(l/.13)):
        xx=x-l/2+.065+i*.13; cyl(g,'brushed',(xx,y-w/2+.04,z),(xx,y+w/2-.04,z),.06,14)
        for yy in [y-w/2-.016,y+w/2+.016]: bolt(g,(xx,yy,z),'Y',.011)
    for xx in [x-l/2+.22,x,x+l/2-.22]:
        for yy in [y-w/2,y+w/2]: foot(g,xx,yy,z-.2)
        box(g,'darksteel',(xx,y,.25),(.035,w,.05))
    cyl(g,'darksteel',(x+.22,y-w/2-.06,z-.19),(x+.22,y-w/2-.30,z-.19),.13,24)
    for i in range(8): cyl(g,'steel',(x+.22,y-w/2-.06-i*.033,z-.19),(x+.22,y-w/2-.075-i*.033,z-.19),.14,20)
    for xx in [x-l*.32,x+l*.30]:
        box(g,'black',(xx,y-w/2-.07,z+.13),(.07,.07,.10),.008)
        pipe(g,'black',[(xx,y-w/2-.1,z+.1),(xx,y-w/2-.12,z-.27),(xx-.4,y-w/2-.12,z-.27)],.012,8)
    box(g,'darksteel',(x,y+w/2+.02,z-.05),(l-.2,.12,.055))
    for i in range(int(l/.1)): box(g,'black',(x-l/2+.12+i*.1,y+w/2+.06,z-.02),(.055,.11,.07),.008)

# Tall distribution-hall envelope, roof members, dock wall, utilities.
box('hall','concrete',(0,0,-.18),(32,22,.34),.04)
for xx in range(16):
    for yy in range(11): box('floor','floor',(-15+xx*2,-10+yy*2,-.004),(1.992,1.992,.025))
box('envelope','wall',(0,11,3.9),(32,.18,7.8)); box('envelope','wall',(-16,0,3.9),(.18,22,7.8))
for xx in range(-15,16): box('envelope','steel',(xx,10.9,3.9),(.028,.04,7.8))
for xx in [-15,-9,-3,3,9,15]:
    box('structure','darksteel',(xx,10.56,4),(.22,.36,8)); box('structure','darksteel',(xx,0,7.8),(.18,21,.28))
    for yy in [-8,-2,4,10]:
        box('structure','steel',(xx,yy,7.55),(.13,.18,.3))
        cyl('structure','darksteel',(xx,yy,7.5),(xx,yy,6.9),.012,8)
        box('lighting','steel',(xx,yy,6.9),(1.25,.32,.09),.02); box('lighting','light',(xx,yy,6.847),(1.15,.25,.016))
    box('structure','white',(xx,10.32,.5),(.32,.12,1),.02)
for zz in [6.9,7.18]:
    cyl('utilities','steel',(-15.6,10.35,zz),(15.6,10.35,zz),.055,16)
    for xx in range(-15,16,2): cyl('utilities','darksteel',(xx-.04,10.35,zz),(xx+.04,10.35,zz),.072,16)
for xx in [-12,-6,0,6,12]:
    pipe('utilities','steel',[(xx,10.32,7.18),(xx,10.32,6.6),(xx,9.8,6.6)],.025,12)
    cyl('utilities','white',(xx,9.8,6.58),(xx,9.8,6.64),.085,16)
for yy in [-9.3,-7.4]: box('traffic','white',(0,yy,.017),(29,.055,.018))
for xx in [-12,-6,0,6,12]:
    box('traffic','white',(xx,-8.35,.022),(1,.10,.02)); box('traffic','white',(xx+.42,-8.15,.022),(.55,.10,.02),rot=-.7); box('traffic','white',(xx+.42,-8.55,.022),(.55,.10,.02),rot=.7)
for xx in range(-8,5): box('traffic','white',(xx*.38,-4.7,.016),(.19,1.15,.018))
text('envelope','ROBO SPACE / FULFILLMENT HUB',(-4,10.78,7.0),.52)

equipment_names={}
def eq(g,name,category='설비'): equipment_names[g]=(name,category)
def rack(g,x,y):
    eq(g,'고층 팔레트 랙 '+g[-2:],'보관 랙')
    for xx in [x-1.7,x,x+1.7]:
        for yy in [y-.68,y+.68]:
            box(g,'darksteel',(xx,yy,3.35),(.095,.095,6.7))
            box(g,'steel',(xx,yy,.045),(.24,.22,.09),.015)
            for zz in [.35+i*.3 for i in range(21)]: box(g,'black',(xx,yy-.05,zz),(.025,.007,.06))
            for zz in [.8,2.45,4.1,5.75]:
                for dz in [-.08,.08]: bolt(g,(xx,yy-.055,zz+dz),'Y',.012)
        for zz in [.9,2.55,4.2,5.85]:
            cyl(g,'steel',(xx,y-.64,zz),(xx,y+.64,zz+1.25),.018,8); cyl(g,'steel',(xx,y+.64,zz),(xx,y-.64,zz+1.25),.018,8)
    for zz in [.8,2.45,4.1]:
        for yy in [y-.67,y+.67]: box(g,'white',(x,yy,zz),(3.48,.09,.16))
        for xx in [x-1.3+i*.32 for i in range(9)]: box(g,'steel',(xx,y,zz+.09),(.05,1.3,.045))
        for xx in [x-.85,x+.85]: pallet(g,xx,y,zz+.12,1)
    for xx in [x-1.7,x,x+1.7]:
        box(g,'white',(xx,y-.84,.36),(.20,.10,.65),.02); box(g,'darksteel',(xx,y-.89,.35),(.14,.01,.08))
    text(g,'R'+g[-2:]+'  /  3500 KG',(x,y-.726,5.7),.19)
for i,(x,y) in enumerate([(-12,7.6),(-7.9,7.6),(-3.8,7.6),(.3,7.6),(-12,2.6),(-12,-2.3)]): rack('rack_%02d'%(i+1),x,y)

# Incoming roller trunk, scanner bridge and perpendicular package diverter chutes.
eq('infeed','입고 롤러 컨베이어'); conveyor('infeed',-7,.5,5.3,1.0)
for i in range(7): carton('infeed',-9.1+i*.61,.47,.863,(.47,.40,.34),i%2)
eq('pick_lane','피킹 축적 롤러'); conveyor('pick_lane',-2.85,.5,2.5,1.0)
carton('pick_lane',-1.82,.50,.866,(.46,.42,.36))
eq('scanner','치수·바코드 스캐너');
for xx in [-6.55,-5.6]:
    for yy in [-.2,1.2]: box('scanner','darksteel',(xx,yy,1.45),(.095,.095,2.9)); box('scanner','steel',(xx,yy,.035),(.25,.25,.07))
    box('scanner','white',(xx,.5,2.8),(.12,1.5,.21),.02)
box('scanner','white',(-6.075,.5,2.82),(1.1,1.35,.13)); box('scanner','glass',(-6.075,.5,2.72),(.70,.90,.04))
for yy in [-.15,1.15]:
    box('scanner','black',(-6.075,yy,1.7),(.65,.09,.35),.015)
    for i in range(8): box('scanner','label',(-6.35+i*.08,yy-.06,1.7),(.018,.01,.20))
hmi('scanner',-5.55,-.27,1.35); text('scanner','DIM / SCAN / WEIGH',(-6.075,-.255,2.5),.12)
for n,(x,y,l) in enumerate([(-7,3.0,4.8),(-3.5,4.4,3.2)]):
    g='sort_lane_%d'%(n+1); eq(g,'분류 슈트 '+str(n+1)); conveyor(g,x,y,l,.85,.68)
    for i in range(4): carton(g,x-l/2+.4+i*.65,y,.746,(.44,.34,.31),i%2)
    for xx in [x-l/2+.3,x+l/2-.3]: box(g,'white',(xx,y+.53,.5),(.08,.14,.94),.015)
    hmi(g,x+l/2-.3,y-.65,1.0)

# Palletizer work zone, low fences, separately grounded controls.
eq('place_pallet','적재 목표 팔레트','작업 대상'); pallet('place_pallet',1.85,.6,0,1)
eq('empty_pallet','빈 팔레트 공급 스택','보관');
for z in [0,.17,.34,.51]: pallet('empty_pallet',3.9,.7,z)
eq('controller','팔레타이저 제어반'); box('controller','white',(2.6,-2.5,.91),(1.1,.68,1.82),.05)
box('controller','darksteel',(2.6,-2.86,.91),(.96,.025,1.60),.025); box('controller','steel',(2.6,-2.88,.91),(.91,.017,1.56),.016)
for i in range(17): box('controller','black',(2.6,-2.899,.31+i*.035),(.58,.007,.013))
for z in [.4,1.48]: box('controller','darksteel',(2.16,-2.903,z),(.047,.035,.13),.012)
hmi('controller',2.6,-2.9,1.40); text('controller','LP-2800 / CTRL',(2.6,-2.91,1.75),.105)
for i in range(8): box('controller','black',(2.30+i*.08,-2.14,.05),(.024,.18,.085),.01)
for n,(x,y,l) in enumerate([(0,3.15,6.0),(4.8,-1.45,2.7)]):
    g='fence_%d'%(n+1); eq(g,'팔레타이징 안전 펜스 '+str(n+1),'안전 설비')
    for xx in [x-l/2,x,x+l/2]: box(g,'darksteel',(xx,y,.96),(.065,.07,1.92)); box(g,'steel',(xx,y,.025),(.20,.20,.05))
    for zz in [.12,1.85]: box(g,'darksteel',(x,y,zz),(l,.055,.055))
    for xx in [x-l/2+.06+i*.12 for i in range(int(l/.12))]: box(g,'steel',(xx,y,.98),(.007,.014,1.64))
    for zz in [.20+i*.12 for i in range(14)]: box(g,'steel',(x,y,zz),(l,.014,.007))
    text(g,'AUTOMATED CELL / KEEP CLEAR',(x,y-.045,1.61),.09)

# Three loading bays have slatted doors, bumper blocks, levellers and staging pallets.
for i,x in enumerate([6,10,14]):
    g='dock_%d'%(i+1); eq(g,'출하 도크 '+str(i+1),'도크')
    box(g,'darksteel',(x,10.75,2.1),(3.45,.22,4.2),.03)
    for z in [.12+j*.24 for j in range(17)]:
        box(g,'brushed',(x,10.59,z),(3.08,.10,.225),.015)
        for xx in [-1.42,1.42]: bolt(g,(x+xx,10.527,z),'Y',.012)
    for xx in [-1.77,1.77]: box(g,'darksteel',(x+xx,10.52,2.12),(.16,.18,4.30))
    box(g,'darksteel',(x,10.46,4.24),(3.72,.25,.18)); box(g,'steel',(x,9.55,.13),(2.45,2.08,.24),.02)
    for j in range(32): box(g,'darksteel',(x,8.59+j*.062,.256),(2.36,.013,.006))
    for xx in [-1.38,1.38]:
        box(g,'rubber',(x+xx,10.31,.52),(.25,.30,.66),.04); box(g,'white',(x+xx,9.0,.35),(.14,.14,.70),.03)
    hmi(g,x-1.87,10.22,1.32); text(g,'DOCK 0'+str(i+1),(x,10.39,4.55),.28)
for i,(x,y) in enumerate([(7.6,5.7),(10,5.7),(12.4,5.7),(8.1,2.7)]):
    g='outbound_%d'%(i+1); eq(g,'출하 대기 팔레트 '+str(i+1),'적재물'); pallet(g,x,y,0,1)
    for layer in range(2,4):
        for xx in [-.29,.29]:
            for yy in [-.31,.10]: carton(g,x+xx,y+yy,.17+layer*.4,(.55,.39,.39),layer%2)

# Electric forklift: mast rails, lift chain, carriage, hydraulic cylinder, forks and cab.
g='forklift'; eq(g,'전동 지게차','이동 설비'); x,y=-7.8,-5.6
box(g,'darksteel',(x,y,.46),(1.18,2.18,.7),.12); box(g,'white',(x,y+.55,.93),(1.08,.96,.48),.14)
for xx in [-.64,.64]:
    for yy in [-.65,.7]:
        cyl(g,'rubber',(x+xx-.11,y+yy,.37),(x+xx+.11,y+yy,.37),.35,32)
        cyl(g,'steel',(x+xx-.115,y+yy,.37),(x+xx+.115,y+yy,.37),.19,24)
        for a in range(6):
            z=.37+.115*math.sin(a*math.pi/3); yy2=y+yy+.115*math.cos(a*math.pi/3); cyl(g,'black',(x+xx-.122,yy2,z),(x+xx+.122,yy2,z),.022,6)
for xx in [-.49,.49]:
    box(g,'darksteel',(x+xx,y+.34,1.78),(.07,1.65,.07)); box(g,'darksteel',(x+xx,y-.44,1.38),(.07,.07,1.45)); box(g,'darksteel',(x+xx,y+1.05,1.38),(.07,.07,1.45))
box(g,'steel',(x,y+.31,2.09),(1.16,1.8,.08),.04)
for xx in [-.38,-.19,0,.19,.38]: box(g,'darksteel',(x+xx,y+.3,2.15),(.045,1.65,.05))
box(g,'rubber',(x,y+.4,1.07),(.55,.53,.16),.07); box(g,'rubber',(x,y+.65,1.34),(.55,.15,.54),.07)
cyl(g,'darksteel',(x-.27,y-.1,.94),(x-.27,y-.1,1.33),.03,16)
for a in range(16):
    t=a*math.pi/8; t2=(a+1)*math.pi/8; cyl(g,'rubber',(x-.27+.15*math.cos(t),y-.1+.15*math.sin(t),1.34),(x-.27+.15*math.cos(t2),y-.1+.15*math.sin(t2),1.34),.018,8)
for xx in [-.43,.43]:
    box(g,'darksteel',(x+xx,y-1.15,1.62),(.15,.18,3.12)); box(g,'steel',(x+xx,y-1.28,1.62),(.05,.06,3.0))
    box(g,'steel',(x+xx,y-1.34,.60),(.12,.12,.88)); box(g,'steel',(x+xx,y-1.89,.18),(.13,1.21,.06),.025)
    for z in [.24+i*.11 for i in range(26)]: box(g,'black',(x+xx,y-1.27,z),(.05,.02,.037))
box(g,'darksteel',(x,y-1.34,.75),(1.06,.13,.50)); cyl(g,'steel',(x,y-1.13,.3),(x,y-1.13,2.74),.052,20)
cyl(g,'brushed',(x,y-1.13,2.50),(x,y-1.13,3.02),.024,16); text(g,'E-24',(x,y-1.415,.85),.16)
g='amr'; eq(g,'자율 이송 AMR','이동 설비'); x,y=6.8,-6.5
box(g,'darksteel',(x,y,.29),(1.65,1.02,.52),.12); box(g,'white',(x,y,.58),(1.53,.94,.14),.08)
for xx in [-.61,.61]:
    for yy in [-.48,.48]: cyl(g,'rubber',(x+xx,y+yy-.06,.2),(x+xx,y+yy+.06,.2),.18,24)
for xx in [-.76,.76]:
    box(g,'glass',(x+xx,y,.38),(.055,.32,.10),.012); cyl(g,'darksteel',(x+xx,y,.48),(x+xx,y,.56),.09,24)
pallet(g,x,y,.66,1); text(g,'AMR / 04',(x,y-.52,.36),.12)

factory_meshes=flush(factory)
# Original heavy-duty four-axis parallel-link palletizer with layered vacuum tool.
root=bpy.data.objects.new('LG_Robot_Root',None); robotcol.objects.link(root)
root['model']='LP-2800 conceptual 4-axis parallel-link palletizer'; root['reach_m']=2.8; root['payload_kg']=80
root['source']='Original Blender MCP procedural virtual testbed; not manufacturer CAD.'
pivots={'J1_Base':(0,0,.43),'J2_Shoulder':(0,0,1.0),'J3_Elbow':(-.58,0,2.34),'J4_Tool':(-1.77,0,1.82)}
parents={'J1_Base':root,'J2_Shoulder':'J1_Base','J3_Elbow':'J2_Shoulder','J4_Tool':'J3_Elbow'}
J={}
for index,(name,pos) in enumerate(pivots.items(),1):
    ob=bpy.data.objects.new('LG_'+name,None); robotcol.objects.link(ob); ob.location=pos; bpy.context.view_layer.update(); w=ob.matrix_world.copy()
    par=parents[name]; ob.parent=J[par] if isinstance(par,str) else par; ob.matrix_world=w
    ob['joint_index']=index; ob['joint_axis_blender']='Z' if index in [1,4] else 'Y'; ob['motion_amplitude']=.18 if index in [1,4] else .06; J[name]=ob
def ringbolts(g,p,r,n=12,axis='Z'):
    for i in range(n):
        t=2*math.pi*i/n; a=(p[0]+r*math.cos(t),p[1]+(r*math.sin(t) if axis=='Z' else 0),p[2]+(r*math.sin(t) if axis!='Z' else 0)); bolt(g,a,axis,.015)
def housing(g,p,r=.27,length=.58):
    x,y,z=p; cyl(g,'white',(x,y-length/2,z),(x,y+length/2,z),r,64)
    for sign in [-1,1]:
        yy=y+sign*length/2; cyl(g,'darksteel',(x,yy,z),(x,yy+sign*.025,z),r*.98,64); cyl(g,'brushed',(x,yy+sign*.025,z),(x,yy+sign*.05,z),r*.85,64)
        ringbolts(g,(x,yy+sign*.06,z),r*.70,12,'Y')
        cyl(g,'darksteel',(x,yy+sign*.05,z),(x,yy+sign*.12,z),r*.33,40)
def beam(g,a,b,width=.22,depth=.30):
    a,b=Vector(a),Vector(b); u=(b-a).normalized(); side=Vector((u.z,0,-u.x))*width/2
    ps=[a+side,a-side,b-side,b+side]; vs=[tuple(p+Vector((0,s*depth/2,0))) for s in [-1,1] for p in ps]
    geom(g,'white',vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
    for sy in [-1,1]:
        aa=a+u*.12; bb=b-u*.12; aa.y+=sy*(depth/2+.012); bb.y=aa.y; cyl(g,'brushed',aa,bb,width*.2,16)
        for k in range(4): bolt(g,tuple(aa+(bb-aa)*k/3),'Y',.016)
box('base','darksteel',(0,0,.10),(1.05,1.05,.20),.12)
for xx in [-.40,.40]:
    for yy in [-.40,.40]: cyl('base','steel',(xx,yy,.2),(xx,yy,.24),.06,24); bolt('base',(xx,yy,.257),r=.038)
cyl('base','white',(0,0,.2),(0,0,.46),.43,72,r2=.32); cyl('base','darksteel',(0,0,.43),(0,0,.50),.35,72)
ringbolts('base',(0,0,.478),.305,20)
cyl('J1_Base','white',(0,0,.49),(0,0,.69),.32,72); box('J1_Base','white',(0,0,.81),(.45,.58,.51),.065)
housing('J2_Shoulder',(0,0,1.0),.29,.68); beam('J2_Shoulder',(0,0,1.02),(-.58,0,2.34),.34,.34)
housing('J3_Elbow',(-.58,0,2.34),.24,.61); beam('J3_Elbow',(-.58,0,2.34),(-1.77,0,1.91),.25,.32)
# Visible offset parallelogram links, tie rods and spring counterbalance.
for sy in [-.31,.31]:
    beam('J2_Shoulder',(.18,sy,1.02),(-.36,sy,2.31),.09,.055)
    beam('J3_Elbow',(-.39,sy,2.50),(-1.72,sy,2.08),.07,.055)
    for p in [(.18,sy,1.02),(-.36,sy,2.31),(-.39,sy,2.5),(-1.72,sy,2.08)]:
        cyl('J2_Shoulder' if p[0]>-.38 else 'J3_Elbow','steel',(p[0],p[1]-.04,p[2]),(p[0],p[1]+.04,p[2]),.064,32)
cyl('J2_Shoulder','darksteel',(.2,.35,.75),(-.08,.35,1.42),.083,40)
cyl('J2_Shoulder','brushed',(-.08,.35,1.42),(-.29,.35,1.94),.038,32)
for i in range(28):
    a=Vector((.19,.35,.77))+Vector((-.27,0,.65))*i/28; d=Vector((-.27,0,.65)).normalized()*.018
    cyl('J2_Shoulder','steel',a-d,a+d,.097,32)
for g,p in [('J1_Base',(.15,.39,.75)),('J2_Shoulder',(.08,-.48,1.02)),('J3_Elbow',(-.58,-.43,2.34))]:
    x,y,z=p; cyl(g,'darksteel',(x,y,z),(x,y-.21,z),.16,48)
    for i in range(14): cyl(g,'steel',(x,y-i*.014,z),(x,y-.006-i*.014,z),.175,40)
    box(g,'black',(x,y-.12,z+.19),(.16,.12,.09),.02)
cyl('J4_Tool','white',(-1.77,0,2.02),(-1.77,0,1.72),.15,64); cyl('J4_Tool','darksteel',(-1.77,0,1.73),(-1.77,0,1.67),.17,64)
ringbolts('J4_Tool',(-1.77,0,1.66),.135,12)
box('J4_Tool','steel',(-1.77,0,1.59),(1.0,.68,.12),.04)
for xx in [-2.15,-1.77,-1.39]:
    box('J4_Tool','brushed',(xx,0,1.5),(.10,.76,.07),.02)
    for yy in [-.28,0,.28]:
        cyl('J4_Tool','steel',(xx,yy,1.49),(xx,yy,1.36),.025,24)
        for z in [1.36,1.39,1.42]: cyl('J4_Tool','rubber',(xx,yy,z),(xx,yy,z+.015),.049,24,r2=.035)
        cyl('J4_Tool','rubber',(xx,yy,1.35),(xx,yy,1.32),.041,32,r2=.070)
        cyl('J4_Tool','black',(xx,yy,1.316),(xx,yy,1.322),.071,32)
        pipe('J4_Tool','black',[(xx,yy,1.47),(xx,yy,1.66),(-1.77,yy,1.67)],.012,10)
for xx in [-2.19,-1.35]:
    for yy in [-.31,.31]: bolt('J4_Tool',(xx,yy,1.664),r=.02)
box('J4_Tool','darksteel',(-1.77,.12,1.72),(.36,.2,.12),.02)
cables=[('J1_Base',[(.29,.22,.35),(.35,.28,.68),(.24,.30,1.13)]),('J2_Shoulder',[(.2,.3,1.10),(.14,.33,1.37),(-.10,.32,1.95),(-.40,.33,2.46)]),('J3_Elbow',[(-.41,.34,2.45),(-.64,.35,2.61),(-1.24,.30,2.37),(-1.72,.26,2.11)]),('J4_Tool',[(-1.72,.26,2.10),(-1.97,.24,1.90),(-1.97,.23,1.72),(-1.78,.22,1.71)])]
for g,pts in cables:
    pipe(g,'black',pts,.029,16)
    for a,b in zip(pts,pts[1:]):
        a,b=Vector(a),Vector(b); u=(b-a).normalized(); steps=max(1,int((b-a).length/.029))
        for k in range(steps):
            p=a+(b-a)*(k+.5)/steps; cyl(g,'rubber',p-u*.005,p+u*.005,.035,14)
box('J1_Base','black',(.08,-.308,.80),(.21,.012,.11),.01)
for i in range(5): box('J1_Base','label',(.025+i*.03,-.319,.80),(.012,.006,.04))
robot_meshes=flush(robotcol)
for ob in robot_meshes:
    parent=J.get(ob['equipment_id'],root); bpy.context.view_layer.update(); w=ob.matrix_world.copy(); ob.parent=parent; ob.matrix_world=w
bpy.context.view_layer.update()

# Collider bounds are calculated from the authored geometry, never UI placeholders.
equipment=[]
for g,(name,category) in equipment_names.items():
    obs=[o for o in factory.objects if o.get('equipment_id')==g and o.type=='MESH']
    pts=[o.matrix_world@Vector(c) for o in obs for c in o.bound_box]
    lo=[min(p[i] for p in pts) for i in range(2)]; hi=[max(p[i] for p in pts) for i in range(2)]
    equipment.append({'id':g,'name':name,'category':category,'footprint':{'kind':'rect','center':{'x':round((lo[0]+hi[0])/2,5),'y':round((lo[1]+hi[1])/2,5)},'width':round(hi[0]-lo[0],5),'depth':round(hi[1]-lo[1],5)},'blocksBase':True,'sweepPolicy':'work-target' if g in ['pick_lane','place_pallet'] else 'advisory'})
def tri_count(obs):
    total=0
    for ob in obs:
        if ob.type=='MESH': ob.data.calc_loop_triangles(); total+=len(ob.data.loop_triangles)
    return total
layout={'slug':'logistics-sortation','title':'물류 분류·출하 공장','shortTitle':'물류·출하','industry':'물류 자동화','description':'8m 고층 랙, 바코드·치수 스캐너, 축적 롤러와 분류 슈트, 3개 출하 도크가 연결된 32×22m 물류 허브. 4축 평행 링크 로봇이 박스를 흡착해 팔레트에 적재합니다.','robotDescription':'4축 평행 링크 팔레타이저 · 다점 진공 그리퍼 · 가상 제원',
'scenario':{'schemaVersion':'1.0','id':'logistics-sortation-v1','name':'고층 랙 물류 분류·팔레타이징 센터','factory':{'width':32,'depth':22,'center':{'x':0,'y':0}},'cell':{'kind':'rect','center':{'x':0,'y':-.5},'width':9,'depth':7},'robot':{'name':'LP-2800','reach':2.8,'footprintDiameter':1.49,'safetyBuffer':.35,'payloadKg':80},'targets':[{'id':'pick','name':'축적 롤러 박스 피킹','position':{'x':-1.82,'y':.5},'equipmentId':'pick_lane'},{'id':'place','name':'출하 팔레트 적재','position':{'x':1.85,'y':.6},'equipmentId':'place_pallet'}],'equipment':equipment,'candidates':[{'id':'A','name':'롤러–팔레트 중앙','position':{'x':0,'y':0},'description':'입고 롤러와 적재 팔레트 사이의 도달·이격 여유를 확보한 배치.'},{'id':'B','name':'작업 통로 인접','position':{'x':-.7,'y':-2.5},'description':'작업 통로 측으로 이동해 팔레트 도달거리가 부족한 비교 배치.'},{'id':'C','name':'제어반 점유 위치','position':{'x':2.6,'y':-2.5},'description':'제어반과 베이스가 겹치는 배치로 충돌 검토를 위한 비교 후보.'}],'pathways':[{'id':'worker','name':'검수·작업자 통로','kind':'worker','width':1.2,'points':[{'x':-10,'y':-4.4},{'x':4.6,'y':-4.4},{'x':4.6,'y':2}]},{'id':'cart','name':'AMR 출하 이송로','kind':'cart','width':1.8,'points':[{'x':-14,'y':-8.35},{'x':13,'y':-8.35},{'x':13,'y':3.8}]}],'roi':{'investment':125000000,'workersBefore':3,'workersAfter':1,'hoursPerDay':12,'daysPerMonth':24,'hourlyWage':22000,'monthlyMaintenance':650000}},'camera':{'cellOffset':[5.0,4.5,6.6],'targetHeight':1.35,'overviewPosition':[31,28,35]},'stats':{'factoryTriangles':tri_count(factory_meshes),'robotTriangles':tri_count(robot_meshes),'factoryMeshes':len(factory_meshes),'robotMeshes':len(robot_meshes)},'provenance':'Original Blender MCP procedural virtual testbed; not measured plant/OEM CAD'}
with open(OUT+'/layout.json','w') as f: json.dump(layout,f,ensure_ascii=False,indent=2)
gltf_props=bpy.ops.export_scene.gltf.get_rna_type().properties
formats=[item[0] for item in io_scene_gltf2.get_format_items(None, bpy.context)]
assert 'GLB' in formats
def export(col,path):
    for ob in scene.objects: ob.select_set(False)
    for ob in col.objects: ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path,export_format='GLB',use_selection=True,use_active_scene=True,export_extras=True,export_apply=True)
export(factory,OUT+'/factory.glb'); export(robotcol,OUT+'/robot.glb')
root.location=(0,0,0)
world=bpy.data.worlds.new('LG_Neutral_World'); world.use_nodes=True
background=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
background.inputs['Color'].default_value=(.20,.20,.20,1); background.inputs['Strength'].default_value=.65; scene.world=world
def area(name,loc,power,size,target):
    light_types=[e.identifier for e in bpy.types.Light.bl_rna.properties['type'].enum_items]
    assert 'AREA' in light_types
    data=bpy.data.lights.new(name,'AREA'); data.energy=power
    shapes=[e.identifier for e in data.bl_rna.properties['shape'].enum_items]
    if 'DISK' in shapes: data.shape='DISK'
    data.size=size
    ob=bpy.data.objects.new(name,data); studio.objects.link(ob); ob.location=loc; ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
area('LG_Key',(2,-8,16),3600,15,(0,0,0)); area('LG_Fill',(-11,-4,11),2000,12,(-5,1,1)); area('LG_Rim',(5,8,14),2400,10,(1,1,2))
camdata=bpy.data.cameras.new('LG_Overview'); cam=bpy.data.objects.new('LG_Overview',camdata); studio.objects.link(cam); cam.location=(26,-31,26); cam.rotation_euler=(Vector((0,1,1.4))-cam.location).to_track_quat('-Z','Y').to_euler()
camtypes=[e.identifier for e in camdata.bl_rna.properties['type'].enum_items]; assert 'ORTHO' in camtypes; camdata.type='ORTHO'; camdata.ortho_scale=39; camdata.clip_end=200; scene.camera=cam
current_engine=scene.render.engine
engines=[e.identifier for e in scene.render.bl_rna.properties['engine'].enum_items]
try:
    scene.render.engine='BLENDER_EEVEE'
except TypeError:
    if 'CYCLES' in engines: scene.render.engine='CYCLES'; scene.cycles.samples=24
    else: scene.render.engine=current_engine
scene.render.resolution_x=1200; scene.render.resolution_y=750; scene.render.resolution_percentage=100
formats=[e.identifier for e in scene.render.image_settings.bl_rna.properties['file_format'].enum_items]; assert 'PNG' in formats; scene.render.image_settings.file_format='PNG'; scene.render.filepath=OUT+'/thumbnail.png'
for ob in scene.objects: ob.select_set(False)
root.select_set(True); bpy.context.view_layer.objects.active=root
# Save only this scene and its recursive dependencies, preserving unrelated scenes.
bpy.data.libraries.write(OUT+'/scene.blend',{scene},fake_user=True,compress=True)
print(json.dumps({'output':OUT,'equipmentCount':len(equipment),'stats':layout['stats'],'scene':scene.name}))
