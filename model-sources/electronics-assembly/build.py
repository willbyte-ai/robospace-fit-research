import bpy, math, json, os, random
import io_scene_gltf2
from mathutils import Vector, Matrix
from collections import defaultdict
random.seed(61)
def choose_enum(owner,prop,value):
    available={i.identifier for i in owner.bl_rna.properties[prop].enum_items}
    if value not in available: raise RuntimeError('Unsupported enum '+prop+': '+value+'; '+str(available))
    setattr(owner,prop,value)
def new_enum_value(owner_type,function,parameter,value):
    available={i.identifier for i in owner_type.bl_rna.functions[function].parameters[parameter].enum_items}
    if value not in available: raise RuntimeError('Unsupported creation enum '+parameter+': '+value+'; '+str(available))
    return value
OUT='/tmp/robospace-scenarios/electronics-assembly'
os.makedirs(OUT,exist_ok=True)
scene=bpy.data.scenes.new('RoboSpace_Fit__Electronics_Assembly_Cleanroom')
bpy.context.window.scene=scene
choose_enum(scene.unit_settings,'system','METRIC'); scene.unit_settings.scale_length=1
factory=bpy.data.collections.new('EA_FACTORY__22x18m_ESD_Cleanroom'); scene.collection.children.link(factory)
robotcol=bpy.data.collections.new('EA_ROBOT__SCARA_1400_Concept'); scene.collection.children.link(robotcol)
studio=bpy.data.collections.new('EA_STUDIO__Camera_Lighting'); scene.collection.children.link(studio)
M={}
def mat(name,color,metal=0,rough=.4,emit=0):
    m=bpy.data.materials.new('EA_'+name); m.diffuse_color=(*color,1); m.use_nodes=True
    bs=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    bs.inputs['Base Color'].default_value=(*color,1); bs.inputs['Metallic'].default_value=metal; bs.inputs['Roughness'].default_value=rough
    if emit: bs.inputs['Emission Color'].default_value=(*color,1); bs.inputs['Emission Strength'].default_value=emit
    M[name]=m; return m
mat('floor',(.51,.51,.51),.22,.48)
mat('white',(.83,.83,.83),.32,.29)
mat('steel',(.43,.43,.43),.86,.25)
mat('brushed',(.65,.65,.65),.75,.33)
mat('darksteel',(.07,.07,.07),.65,.32)
mat('black',(.012,.012,.012),.12,.44)
mat('rubber',(.027,.027,.027),.04,.69)
mat('glass',(.23,.23,.23),.55,.13)
mat('ink',(.065,.065,.065),.1,.5)
mat('label',(.92,.92,.92),.06,.58)
mat('light',(.92,.92,.92),.05,.22,3)
mat('board',(.13,.13,.13),.28,.43)
mat('trace',(.56,.56,.56),.85,.28)
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
    cv=bpy.data.curves.new(g+'_Label',new_enum_value(bpy.types.BlendDataCurves,'new','type','FONT')); cv.body=text; cv.size=size; cv.extrude=.0008; choose_enum(cv,'align_x','CENTER')
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


# Cleanroom shell. Front and right walls are cut away for a readable digital twin.
box('hall','darksteel',(0,0,-.19),(22.18,18.18,.36),.06)
for i in range(22):
    for j in range(18):
        x,y=-10.5+i,-8.5+j
        box('floor','floor',(x,y,-.02),(.991,.991,.04))
        # Visible perforated raised-floor vent tiles beside the process aisles.
        if j in [5,11] and i%2==0:
            for u in range(5):
                for v in range(5):
                    cyl('floor','darksteel',(x-.32+u*.16,y-.32+v*.16,.001),(x-.32+u*.16,y-.32+v*.16,.007),.024,8)
        for dx,dy in [(-.44,-.44),(.44,.44)]: bolt('floor',(x+dx,y+dy,.004),r=.007)
for x in [-10.5+i for i in range(22)]:
    box('envelope','white',(x,8.98,2.1),(.986,.12,4.2),.012)
    box('envelope','brushed',(x,8.90,.14),(.986,.03,.27))
for y in [-8.5+i for i in range(18)]:
    box('envelope','white',(-10.99,y,2.1),(.12,.986,4.2),.012)
    box('envelope','brushed',(-10.90,y,.14),(.03,.986,.27))
for x in [-10,-6,-2,2,6,10]:
    box('structure','brushed',(x,8.7,2.15),(.11,.14,4.3),.02)
# Rear observation glazing, flush frames, narrow wall-mounted services.
for x in [-6,-3,0,3,6]:
    box('windows','darksteel',(x,8.86,2.05),(2.6,.06,1.35),.015)
    box('windows','glass',(x,8.80,2.05),(2.48,.025,1.23),.008)
    for dx in [-1.25,0,1.25]: box('windows','brushed',(x+dx,8.765,2.05),(.035,.025,1.28))
    box('windows','brushed',(x,8.76,1.42),(2.58,.035,.035))
# Suspended HEPA modules with finned underside, lights, and air connections.
for x,y in [(-7,6),(-2,6),(3,6),(8,6),(-7,-1),(7,-1)]:
    box('hvac','brushed',(x,y,4.0),(2.1,1.45,.22),.035)
    box('hvac','darksteel',(x,y,3.873),(1.92,1.28,.035))
    for k in range(27): box('hvac','white',(x-.90+k*.069,y,3.848),(.02,1.22,.034))
    for dx in [-.9,.9]:
        for dy in [-.58,.58]: cyl('hvac','steel',(x+dx,y+dy,4.11),(x+dx,y+dy,4.40),.007,8)
    box('lighting','steel',(x,y-.95,3.89),(1.85,.18,.07),.018)
    box('lighting','light',(x,y-.95,3.845),(1.77,.14,.012))
# Narrow rear service duct; flexible connections and compressed air drops.
box('hvac','brushed',(0,7.8,4.27),(20,.55,.37),.05)
for x in range(-9,10): box('hvac','steel',(x,7.8,4.27),(.024,.58,.40))
for z in [3.4,3.55]: cyl('utilities','steel',(-10.65,8.45,z),(10.4,8.45,z),.028,12)
for x in [-8,-4,1,6,9]:
    pipe('utilities','brushed',[(x,8.45,3.4),(x,8.45,1.22),(x,8.26,1.22)],.018,10)
    box('utilities','darksteel',(x,8.23,1.2),(.12,.06,.10),.01)
    box('utilities','white',(x,8.16,1.2),(.045,.09,.024))
for y in [-6.0,-4.8]: box('traffic','white',(0,y,.011),(20.5,.025,.012))
for x in [-7,-2,3,8]:
    box('traffic','white',(x,-5.4,.013),(.65,.035,.013))
    box('traffic','white',(x+.22,-5.3,.013),(.28,.035,.013),rot=-.7)
    box('traffic','white',(x+.22,-5.5,.013),(.28,.035,.013),rot=.7)
label('envelope','MICRO ASSEMBLY / ESD CONTROLLED AREA',(-1.0,8.79,3.85),.30,m='ink')
label('traffic','MATERIAL FLOW',(-7,-5.8,.018),.22,rot=(0,0,0),m='label')

# Equipment registry; footprints are calculated from the actual batched geometry.
EQ={}
def register(g,name,category='설비',work=False): EQ[g]={'name':name,'category':category,'work':work}
def feet(g,x,y,w,d,z=.88):
    for dx in [-w/2+.10,w/2-.10]:
        for dy in [-d/2+.10,d/2-.10]: foot(g,x+dx,y+dy,z)
def hmi(g,x,y,z,w=.37):
    box(g,'darksteel',(x,y,z),(w,.075,.28),.023)
    box(g,'glass',(x,y-.044,z+.02),(w-.07,.013,.19),.009)
    for i in range(4): box(g,'label',(x-.045,y-.052,z+.06-i*.028),(.12+i*.018,.003,.007))
    for i in range(3):
        cyl(g,'brushed',(x-w*.31+i*w*.30,y-.05,z-.102),(x-w*.31+i*w*.30,y-.069,z-.102),.013,12)
def pcb(g,x,y,z,scale=1,style=0):
    sx,sy=.24*scale,.16*scale
    box(g,'board',(x,y,z),(sx,sy,.012*scale),.005)
    # IC package, pin rows, passive components, vias and routed copper traces.
    box(g,'black',(x-.025*scale,y,z+.021*scale),(.067*scale,.065*scale,.029*scale),.004)
    for k in range(9):
        dx=(-.055+k*.0075)*scale
        for side in [-1,1]: box(g,'trace',(x+dx,y+side*.039*scale,z+.010*scale),(.003*scale,.017*scale,.005*scale))
    for k in range(8):
        px=x+(.032+(k%2)*.04)*scale; py=y+(-.052+(k//2)*.035)*scale
        box(g,'brushed',(px,py,z+.01*scale),(.018*scale,.009*scale,.009*scale),.002)
        box(g,'black',(px,py,z+.015*scale),(.011*scale,.009*scale,.005*scale))
    for k in range(5):
        box(g,'trace',(x+(-.105+k*.027)*scale,y+.064*scale,z+.008*scale),(.013*scale,.013*scale,.004*scale))
        box(g,'trace',(x+(-.105+k*.027)*scale,y+.054*scale,z+.008*scale),(.002*scale,.029*scale,.003*scale))
    box(g,'white',(x-.09*scale,y-.043*scale,z+.022*scale),(.028*scale,.044*scale,.03*scale),.002)
    for dx in [-.104,.104]:
        for dy in [-.063,.063]: cyl(g,'steel',(x+dx*scale,y+dy*scale,z+.005*scale),(x+dx*scale,y+dy*scale,z+.012*scale),.009*scale,10)
def conveyor(g,x,y,w=1.4,d=.52,z=.93):
    for yy in [y-d/2,y+d/2]: box(g,'brushed',(x,yy,z-.045),(w,.045,.115),.014)
    box(g,'rubber',(x,y,z),(w,d-.065,.035),.01)
    for k in range(int(w/.052)): box(g,'black',(x-w/2+.03+k*.052,y,z+.02),(.008,d-.06,.005))
    for xx in [x-w/2+.06,x+w/2-.06]:
        cyl(g,'steel',(xx,y-d/2,z),(xx,y+d/2,z),.043,20)
        box(g,'darksteel',(xx,y-d/2-.03,z),(.09,.08,.09),.012)
    feet(g,x,y,w,d,z-.11)
def machine(g,x,y,w,d,h,title,kind='smt'):
    register(g,title)
    feet(g,x,y,w,d,.23)
    box(g,'darksteel',(x,y,.23),(w-.15,d-.12,.22),.03)
    box(g,'white',(x,y,(h+.27)/2),(w,d,h-.27),.045)
    # Lower access doors, flush latches, panel seams and foot recess.
    for dx in [-w*.25,w*.25]:
        panel(g,(x+dx,y-d/2-.017,.51),(w*.46,.025,.49),'white')
        box(g,'darksteel',(x+dx+w*.18,y-d/2-.044,.60),(.027,.014,.105),.005)
    for dy in [-d*.38,d*.38]:
        for zz in [.6,h-.22]:
            box(g,'brushed',(x-w/2-.014,y+dy,zz),(.026,.09,.08),.005)
    if kind in ['smt','printer']:
        box(g,'darksteel',(x,y-d/2-.024,1.40),(w-.14,.036,.62),.025)
        box(g,'glass',(x,y-d/2-.046,1.40),(w-.23,.022,.52),.025)
        box(g,'white',(x,y-d/2-.070,1.4),(.035,.035,.57))
        # Geometry above the chamber shows the precision bridge gantry under clear top.
        box(g,'darksteel',(x,y,1.03),(w-.22,d-.20,.07))
        for dy in [-d*.3,d*.3]: cyl(g,'steel',(x-w*.39,y+dy,1.12),(x+w*.39,y+dy,1.12),.025,16)
        box(g,'brushed',(x-.10,y,1.24),(.24,d-.30,.18),.018)
        for k in range(6):
            cyl(g,'darksteel',(x-.12+k*.038,y-.05,1.15),(x-.12+k*.038,y-.05,1.02),.014,12)
        # Feeder row and reels on the operator side are deliberately exposed.
        for k in range(12):
            xx=x-w*.40+k*w*.8/11
            box(g,'brushed',(xx,y-d/2-.22,.99),(.058,.39,.08),.008)
            cyl(g,'black',(xx-.015,y-d/2-.36,.88),(xx+.015,y-d/2-.36,.88),.105,20)
            cyl(g,'steel',(xx-.019,y-d/2-.36,.88),(xx+.019,y-d/2-.36,.88),.028,16)
            box(g,'darksteel',(xx,y-d/2-.15,1.046),(.018,.19,.015))
    elif kind=='aoi':
        box(g,'darksteel',(x,y-d/2-.021,1.38),(w-.15,.04,.57),.02)
        box(g,'glass',(x,y-d/2-.048,1.38),(w-.27,.02,.46),.01)
        cyl(g,'steel',(x,y,1.15),(x,y,1.62),.04,18)
        box(g,'darksteel',(x,y-.08,1.50),(.21,.29,.18),.02)
        cyl(g,'black',(x,y-.08,1.41),(x,y-.08,1.34),.07,24)
        cyl(g,'light',(x,y-.08,1.345),(x,y-.08,1.33),.092,28)
    else:
        for k in range(8): box(g,'darksteel',(x-w/2+.12+k*(w-.24)/7,y-d/2-.021,1.34),(.012,.014,.55))
    hmi(g,x+w*.28,y-d/2-.10,h-.27)
    # Rear exhaust duct and electrical cover, thermal slots, tower status rings.
    for k in range(12): box(g,'darksteel',(x+w/2+.016,y-.27+k*.05,.68),(.018,.025,.20))
    cyl(g,'brushed',(x-w*.32,y+d*.25,h),(x-w*.32,y+d*.25,h+.19),.065,20)
    cyl(g,'darksteel',(x+w*.37,y-d*.28,h),(x+w*.37,y-d*.28,h+.14),.021,12)
    for k in range(3): cyl(g,'white' if k==1 else 'darksteel',(x+w*.37,y-d*.28,h+.14+k*.075),(x+w*.37,y-d*.28,h+.21+k*.075),.035,16)
    label(g,title.upper(),(x,y-d/2-.081,h+.06),.115)
    pcb(g,x,y,1.09,1.3)

# A clearly recognizable SMT production line occupies the back half of the cleanroom.
machine('solder_printer',-7.4,4.25,1.85,1.45,1.80,'STENCIL / 01','printer')
machine('chip_mounter',-4.95,4.25,2.05,1.55,1.96,'SMT / 02','smt')
machine('reflow_oven',-1.75,4.25,3.50,1.45,1.42,'REFLOW / 03','oven')
# Oven zone caps, exhaust hoods, latches, individual thermal chamber indicators.
for k in range(7):
    xx=-3.22+k*.49
    box('reflow_oven','brushed',(xx,4.25,1.46),(.45,1.40,.11),.015)
    box('reflow_oven','darksteel',(xx,3.49,1.04),(.16,.04,.07),.007)
    box('reflow_oven','label',(xx,3.465,1.04),(.082,.007,.028))
    cyl('reflow_oven','steel',(xx,4.71,1.49),(xx,4.71,1.64),.042,16)
machine('aoi_inline',1.05,4.25,1.35,1.25,1.86,'3D AOI / 04','aoi')
for g,x,title in [('pcb_loader',-9.33,'PCB LOADER'),('pcb_unloader',3.00,'PCB UNLOADER')]:
    register(g,'PCB 매거진 로더' if x<0 else 'PCB 매거진 언로더')
    box(g,'white',(x,4.25,.67),(1.1,1.12,1.23),.028)
    box(g,'darksteel',(x,3.672,1.04),(.85,.024,.68))
    for z in [.77+i*.067 for i in range(9)]:
        box(g,'steel',(x,3.65,z),(.81,.035,.012))
        box(g,'board',(x,4.12,z),(.68,.72,.013))
    feet(g,x,4.25,1.1,1.12,.16); hmi(g,x+.30,3.61,1.54,.29)
    box(g,'brushed',(x,4.69,1.53),(.94,.18,.50),.02)
    label(g,title,(x,3.646,.27),.11)
for idx,x in enumerate([-8.5,-6.21,-3.65,.10,2.09]):
    g='smt_bridge_'+str(idx)
    # These bridge conveyors belong to adjoining machine bodies in the footprint registry.
    conveyor('solder_printer' if idx<2 else ('chip_mounter' if idx==2 else 'aoi_inline'),x,4.25,.44,.48,1.025)

# Central SCARA assembly and electrical-test cell, open front and separate low workstations.
def fixture(g,x,y,title,inspection=False):
    register(g,title,'작업대',True)
    feet(g,x,y,.74,.94,.92)
    box(g,'darksteel',(x,y,.87),(.72,.90,.085),.018)
    box(g,'brushed',(x,y,.934),(.78,.96,.035),.018)
    for u in range(6):
        for v in range(7): cyl(g,'darksteel',(x-.30+u*.12,y-.36+v*.12,.955),(x-.30+u*.12,y-.36+v*.12,.960),.012,10)
    box(g,'black',(x,y,.982),(.40,.31,.035),.008)
    box(g,'white',(x,y,1.008),(.33,.26,.019),.006)
    pcb(g,x,y,1.024,1.05)
    for dx in [-.16,.16]:
        for dy in [-.14,.14]:
            cyl(g,'steel',(x+dx,y+dy,.970),(x+dx,y+dy,1.063),.009,12)
    box(g,'brushed',(x-.25,y,.992),(.09,.35,.09),.012)
    for k in range(5): box(g,'black',(x-.25,y-.14+k*.07,1.044),(.09,.014,.008))
    box(g,'darksteel',(x,y-.47,.78),(.42,.04,.10),.015)
    label(g,'E-TEST' if inspection else 'PCB IN',(x,y-.494,.77),.085)
    if inspection:
        for dx in [-.32,.32]: cyl(g,'steel',(x+dx,y+.37,.94),(x+dx,y+.37,1.58),.023,14)
        box(g,'white',(x,y+.37,1.58),(.73,.09,.10),.015)
        box(g,'darksteel',(x,y+.26,1.50),(.15,.22,.16),.015)
        cyl(g,'black',(x,y+.22,1.43),(x,y+.22,1.35),.046,24)
        cyl(g,'light',(x,y+.22,1.365),(x,y+.22,1.35),.064,24)
        for k in range(10):
            pipe(g,'black',[(x+.31,y+.37,1.45-k*.027),(x+.36,y+.38,1.45-k*.027),(x+.36,y+.43,.89)],.004,6)
    else:
        for k in range(5):
            box(g,'brushed',(x,y+.29,.98+k*.043),(.32,.25,.022),.008)
            pcb(g,x,y+.29,.995+k*.043,.87)
fixture('pcb_input_fixture',-1.05,-.47,'PCB 공급 정렬 지그',False)
fixture('electrical_test_fixture',1.05,-.47,'전기 검사·배출 지그',True)
register('scara_controller','SCARA 제어반','제어반')
x,y=2.80,.80
box('scara_controller','white',(x,y,.77),(.82,.60,1.44),.035)
feet('scara_controller',x,y,.82,.60,.13)
panel('scara_controller',(x,y-.32,.79),(.76,.025,1.30),'white')
hmi('scara_controller',x,y-.38,1.20,.43)
for k in range(12): box('scara_controller','darksteel',(x-.20+k*.035,y-.342,.40),(.012,.011,.19))
box('scara_controller','darksteel',(x+.29,y-.36,.81),(.032,.04,.20),.006)
label('scara_controller','SCARA / CONTROL',(x,y-.346,.63),.078)
# Two rear safety posts only, no fictitious full-rectangle collider surrounding the robot.
for side in [-1,1]:
    g='safety_scanner_'+str(side); register(g,'안전 레이저 스캐너 '+('좌' if side<0 else '우'),'안전 설비')
    x,y=side*1.80,1.22
    box(g,'steel',(x,y,.023),(.24,.24,.045),.015)
    box(g,'brushed',(x,y,.43),(.08,.08,.82),.008)
    box(g,'darksteel',(x,y-.03,.78),(.17,.18,.12),.023)
    box(g,'glass',(x,y-.128,.78),(.14,.012,.053),.010)
    for dx in [-.08,.08]:
        for dy in [-.08,.08]: bolt(g,(x+dx,y+dy,.052),r=.012)

# ESD rework benches, microscope, fume extraction and reels. Each body remains one collision item.
def workbench(g,x,y,kind=0):
    register(g,'ESD '+('현미경 리워크' if kind==0 else '검사·프로그래밍')+' 작업대','작업대')
    feet(g,x,y,2.05,1.08,.89)
    box(g,'brushed',(x,y,.87),(2.12,1.14,.07),.014)
    box(g,'rubber',(x,y,.921),(2.01,1.02,.025),.006)
    for dx in [-.94,.94]:
        box(g,'brushed',(x+dx,y+.45,1.25),(.043,.043,.75))
        box(g,'brushed',(x+dx,y,.21),(.035,.99,.035))
    box(g,'white',(x,y+.45,1.64),(2.0,.35,.04),.008)
    box(g,'lighting' if 'lighting' in M else 'light',(x,y+.39,1.61),(1.83,.08,.015))
    box(g,'darksteel',(x,y+.49,1.18),(1.90,.04,.11),.009)
    for k in range(7):
        xx=x-.73+k*.25
        box(g,'white',(xx,y+.46,1.18),(.082,.018,.065),.006)
        for dx in [-.020,.020]: cyl(g,'black',(xx+dx,y+.449,1.18),(xx+dx,y+.444,1.18),.006,8)
    # Drawer chest and handles.
    box(g,'white',(x-.62,y,.56),(.53,.83,.62),.012)
    for k in range(4):
        box(g,'brushed',(x-.62,y-.429,.32+k*.16),(.48,.022,.14),.008)
        box(g,'darksteel',(x-.62,y-.45,.355+k*.16),(.20,.023,.022),.007)
    for k in range(3): pcb(g,x-.34+k*.36,y-.12,.955,1.1)
    # Monitor on hinged arm, diagnostics interface and keyboard.
    cyl(g,'darksteel',(x+.60,y+.33,.94),(x+.60,y+.33,1.23),.025,16)
    box(g,'darksteel',(x+.60,y+.30,1.42),(.45,.065,.30),.022)
    box(g,'glass',(x+.60,y+.26,1.42),(.40,.014,.245),.008)
    for k in range(6): box(g,'label',(x+.54,y+.25,1.48-k*.025),(.19+(k%2)*.09,.004,.005))
    box(g,'darksteel',(x+.59,y-.19,.96),(.40,.18,.022),.012)
    for i in range(10):
        for j in range(3): box(g,'white',(x+.424+i*.035,y-.25+j*.043,.975),(.024,.030,.010),.003)
    if kind==0:
        box(g,'white',(x-.55,y+.12,.98),(.30,.34,.06),.022)
        cyl(g,'steel',(x-.55,y+.24,.99),(x-.55,y+.24,1.36),.022,20)
        box(g,'white',(x-.55,y+.16,1.31),(.23,.27,.14),.030)
        for dx in [-.055,.055]:
            cyl(g,'black',(x-.55+dx,y+.10,1.34),(x-.55+dx,y-.03,1.40),.028,20)
            cyl(g,'rubber',(x-.55+dx,y-.03,1.40),(x-.55+dx,y-.048,1.409),.034,20)
        cyl(g,'black',(x-.55,y+.13,1.24),(x-.55,y+.13,1.17),.041,24)
        # Extraction articulated duct and soldering iron station.
        pipe(g,'darksteel',[(x+.15,y+.37,.95),(x+.15,y+.37,1.35),(x-.05,y+.10,1.44),(x-.22,y-.08,1.27)],.035,12)
        cyl(g,'black',(x-.22,y-.08,1.27),(x-.28,y-.14,1.20),.055,20,r2=.092)
        box(g,'white',(x+.16,y-.2,1.00),(.17,.22,.10),.015)
        pipe(g,'black',[(x+.16,y-.20,1.07),(x+.27,y-.25,1.10),(x+.30,y-.40,1.04)],.008,8)
    label(g,'ESD REWORK' if kind==0 else 'FUNCTION TEST',(x,y-.578,.84),.11)
workbench('esd_rework_1',6.0,1.85,0)
workbench('esd_rework_2',8.8,1.85,1)
workbench('esd_test_1',6.0,-2.7,1)
workbench('esd_test_2',8.8,-2.7,0)
# Backless cleanroom stools with five-star bases and ESD foot rings.
for idx,(x,y) in enumerate([(6,-.05),(8.8,-.05),(6,-4.55),(8.8,-4.55)]):
    g='esd_stool_'+str(idx); register(g,'ESD 작업 의자 '+str(idx+1),'작업 의자')
    cyl(g,'rubber',(x,y,.56),(x,y,.64),.21,32)
    cyl(g,'steel',(x,y,.10),(x,y,.58),.038,18)
    for k in range(5):
        a=k*2*math.pi/5; xx,yy=x+.26*math.cos(a),y+.26*math.sin(a)
        cyl(g,'brushed',(x,y,.13),(xx,yy,.06),.022,12)
        cyl(g,'rubber',(xx-.025,yy,.035),(xx+.025,yy,.035),.035,16)
# Board transport carts with slotted magazines, anti-static wheels and card holders.
for idx,(x,y) in enumerate([(-6.1,-3.4),(-3.65,-3.4),(-8.65,-3.4)]):
    g='pcb_trolley_'+str(idx); register(g,'ESD PCB 매거진 카트 '+str(idx+1),'이동 설비')
    for dx in [-.37,.37]:
        for dy in [-.32,.32]:
            cyl(g,'rubber',(x+dx-.026,y+dy,.085),(x+dx+.026,y+dy,.085),.071,20)
            box(g,'brushed',(x+dx,y+dy,.18),(.05,.08,.12),.008)
            box(g,'brushed',(x+dx,y+dy,.69),(.035,.035,1.10))
    for z in [.24,.70,1.13]:
        box(g,'brushed',(x,y,z),(.85,.78,.035),.007)
        box(g,'darksteel',(x,y,z+.025),(.74,.67,.018))
    for level in [0,1]:
        zz=.31+level*.45
        for dx in [-.27,.27]: box(g,'black',(x+dx,y,zz+.14),(.028,.60,.29),.003)
        for k in range(8):
            box(g,'board',(x,y,zz+k*.035),(.53,.50,.012))
            box(g,'brushed',(x,y-.26,zz+k*.035),(.56,.028,.012))
    pipe(g,'steel',[(x-.37,y+.37,.95),(x-.37,y+.37,1.28),(x+.37,y+.37,1.28),(x+.37,y+.37,.95)],.019,12)
    box(g,'label',(x,y-.41,.93),(.34,.018,.17),.006)
    label(g,'ESD / PCB '+str(idx+1),(x,y-.424,.90),.068,m='ink')
# Feeder preparation racks and reel spokes give the electronics line its distinctive silhouette.
for idx,x in enumerate([-7.6,-4.2]):
    g='feeder_rack_'+str(idx); register(g,'SMT 피더 준비 랙 '+str(idx+1),'보관 설비')
    y=7.18
    for dx in [-.86,.86]:
        for dy in [-.38,.38]: box(g,'brushed',(x+dx,y+dy,.89),(.045,.045,1.76))
    for z in [.20,.77,1.35]:
        box(g,'steel',(x,y,z),(1.80,.85,.035))
        for k in range(10):
            xx=x-.76+k*.168
            cyl(g,'darksteel',(xx-.019,y,z+.21),(xx+.019,y,z+.21),.185,24)
            cyl(g,'brushed',(xx-.023,y,z+.21),(xx+.023,y,z+.21),.071,20)
            for a in range(6):
                t=a*math.pi/3
                cyl(g,'steel',(xx-.025,y+.08*math.cos(t),z+.21+.08*math.sin(t)),(xx-.025,y+.155*math.cos(t),z+.21+.155*math.sin(t)),.008,8)
    label(g,'FEEDER LIBRARY',(x,y-.449,1.80),.12)
# Cleanroom entry: interlocked air shower, gown lockers and shoe-change bench.
register('air_shower','클린룸 에어샤워','출입 설비')
x,y=-9.45,7.12
box('air_shower','white',(x-.68,y,1.2),(.20,1.30,2.4),.026)
box('air_shower','white',(x+.68,y,1.2),(.20,1.30,2.4),.026)
box('air_shower','white',(x,y,2.30),(1.56,1.30,.20),.035)
box('air_shower','glass',(x,y+.62,1.11),(1.08,.035,2.17),.015)
for dx in [-.40,.40]: box('air_shower','brushed',(x+dx,y+.59,1.0),(.025,.035,.40))
for side in [-1,1]:
    for zz in [.55,.95,1.35,1.75]:
        for yy in [-.36,.22]: cyl('air_shower','darksteel',(x+side*.568,y+yy,zz),(x+side*.55,y+yy,zz),.031,16)
label('air_shower','AIR SHOWER',(x,y-.667,2.245),.13,m='ink')
register('cleanroom_lockers','방진복·공구 수납장','보관 설비')
x,y=6.65,7.73
box('cleanroom_lockers','white',(x,y,1.05),(3.20,.66,2.04),.035)
for k in range(6):
    xx=x-1.33+k*.532
    panel('cleanroom_lockers',(xx,y-.35,1.05),(.51,.03,1.95),'white')
    box('cleanroom_lockers','darksteel',(xx+.14,y-.379,1.06),(.025,.018,.19),.004)
    for j in range(4): box('cleanroom_lockers','darksteel',(xx,y-.373,1.69+j*.043),(.29,.011,.014))
    box('cleanroom_lockers','label',(xx,y-.377,1.46),(.14,.013,.11),.007)
    label('cleanroom_lockers',str(k+1).zfill(2),(xx,y-.387,1.44),.056,m='ink')
register('consumable_rack','청정 소모품 보관 선반','보관 설비')
x,y=9.2,6.0
for dx in [-.60,.60]:
    for dy in [-.35,.35]: box('consumable_rack','steel',(x+dx,y+dy,.94),(.05,.05,1.88))
for level,z in enumerate([.17,.66,1.15,1.64]):
    box('consumable_rack','brushed',(x,y,z),(1.32,.80,.038))
    for k in range(3):
        xx=x-.42+k*.42
        box('consumable_rack','white',(xx,y,z+.16),(.35,.62,.28),.015)
        box('consumable_rack','darksteel',(xx,y-.323,z+.16),(.17,.016,.075),.006)
# Local machine labels are data, not claims about real production or measured facilities.
factory_objects=flush(factory)

# Precision SCARA with four mechanical axes: two horizontal rotary links,
# a vertical prismatic quill and a rotary electric micro-gripper.
root=bpy.data.objects.new('EA_SCARA_Root',None); robotcol.objects.link(root)
root['model']='SC-1400 conceptual four-axis precision SCARA'; root['reach_m']=1.40; root['payload_kg']=4
root['source']='Original procedural concept, not OEM CAD or certified robot specification.'
pivots={'EA_J1_Base':(0,0,1.12),'EA_J2_Elbow':(-.65,0,1.28),'EA_J3_Quill':(-1.20,-.32,1.30),'EA_J4_Tool':(-1.20,-.32,1.04)}
parents={'EA_J1_Base':root,'EA_J2_Elbow':'EA_J1_Base','EA_J3_Quill':'EA_J2_Elbow','EA_J4_Tool':'EA_J3_Quill'}
J={}
for i,(name,pos) in enumerate(pivots.items(),1):
    ob=bpy.data.objects.new(name,None); robotcol.objects.link(ob); ob.location=pos
    bpy.context.view_layer.update(); w=ob.matrix_world.copy()
    ob.parent=J[parents[name]] if isinstance(parents[name],str) else parents[name]; ob.matrix_world=w
    ob['joint_index']=i; ob['joint_axis_blender']='Z'; ob['joint_motion']='linear' if i==3 else 'rotary'
    ob['motion_amplitude']=.06 if i==3 else (.08 if i==1 else .11)
    J[name]=ob
# Circular floor mounting pad and raised cast column (no invisible pedestal collider).
cyl('base','darksteel',(0,0,.0),(0,0,.055),.22,64)
cyl('base','brushed',(0,0,.055),(0,0,.092),.20,64)
for k in range(8):
    a=k*math.pi/4; xx,yy=.18*math.cos(a),.18*math.sin(a)
    cyl('base','steel',(xx,yy,.091),(xx,yy,.104),.020,20)
    bolt('base',(xx,yy,.116),r=.015)
cyl('base','white',(0,0,.092),(0,0,.90),.149,64,r2=.130)
for z in [.15,.78,.85]: cyl('base','brushed',(0,0,z),(0,0,z+.018),.152 if z<.20 else .134,64)
box('base','white',(.04,.02,.63),(.21,.27,.42),.040)
box('base','darksteel',(.04,-.124,.64),(.115,.02,.19),.012)
for k in range(7): box('base','black',(.04,-.137,.582+k*.02),(.07,.007,.007))
cyl('base','steel',(0,0,.88),(0,0,1.01),.117,64)
cyl('EA_J1_Base','darksteel',(0,0,.96),(0,0,1.015),.15,64)
cyl('EA_J1_Base','white',(0,0,1.015),(0,0,1.19),.146,64)
cyl('EA_J1_Base','brushed',(0,0,1.175),(0,0,1.196),.148,64)
# Machined horizontal links use rounded end caps and flat service covers.
def link(g,a,b,w,h,z):
    a,b=Vector(a),Vector(b); mid=(a+b)/2; length=(b-a).length; theta=math.atan2(b.y-a.y,b.x-a.x)
    box(g,'white',(mid.x,mid.y,z),(length,w,h),.040,rot=theta)
    for p in [a,b]: cyl(g,'white',(p.x,p.y,z-h/2),(p.x,p.y,z+h/2),w/2,48)
    box(g,'brushed',(mid.x,mid.y,z+h/2+.004),(length*.74,w*.64,.014),.035,rot=theta)
    # Offset screw rows align with the long sides of the arm.
    u=(b-a).normalized(); v=Vector((-u.y,u.x,0))
    for t in [.13,.30,.50,.70,.87]:
        for side in [-1,1]:
            p=a+(b-a)*t+v*side*w*.29
            cyl(g,'darksteel',(p.x,p.y,z+h/2+.013),(p.x,p.y,z+h/2+.018),.009,12)
    for side in [-1,1]:
        p=mid+v*side*w*.505
        box(g,'darksteel',(p.x,p.y,z-.02),(length*.53,.007,.022),.003,rot=theta)
link('EA_J1_Base',(0,0,0),(-.65,0,0),.253,.19,1.155)
cyl('EA_J1_Base','darksteel',(-.65,0,1.055),(-.65,0,1.240),.14,64)
cyl('EA_J2_Elbow','brushed',(-.65,0,1.225),(-.65,0,1.245),.139,64)
cyl('EA_J2_Elbow','white',(-.65,0,1.245),(-.65,0,1.40),.133,64)
link('EA_J2_Elbow',(-.65,0,0),(-1.20,-.32,0),.218,.16,1.345)
# Visible servo covers, connector rings and sealing fasteners.
for g,x,y,z,r in [('EA_J1_Base',0,0,1.21,.13),('EA_J2_Elbow',-.65,0,1.42,.119)]:
    cyl(g,'darksteel',(x,y,z-.018),(x,y,z),r,64)
    cyl(g,'white',(x,y,z),(x,y,z+.016),r*.90,64)
    for k in range(12):
        a=k*math.pi/6; xx,yy=x+r*.73*math.cos(a),y+r*.73*math.sin(a)
        cyl(g,'steel',(xx,yy,z+.016),(xx,yy,z+.020),.007,10)
        bolt(g,(xx,yy,z+.022),r=.004)
# Fixed quill guide housing is attached to the second rotary link.
x,y=-1.20,-.32
box('EA_J2_Elbow','white',(x,y,1.43),(.22,.23,.35),.037)
for dx in [-.087,.087]:
    for dy in [-.080,.080]:
        cyl('EA_J2_Elbow','brushed',(x+dx,y+dy,1.255),(x+dx,y+dy,1.60),.008,12)
        bolt('EA_J2_Elbow',(x+dx,y+dy,1.61),r=.009)
box('EA_J2_Elbow','darksteel',(x,y-.123,1.44),(.105,.016,.175),.013)
for k in range(8): box('EA_J2_Elbow','black',(x,y-.134,1.38+k*.017),(.062,.006,.007))
# Quill travels vertically. Splined shaft, bellows, polished sliding rails and ruler.
cyl('EA_J3_Quill','steel',(x,y,.98),(x,y,1.88),.025,48)
for k in range(10):
    a=k*math.pi/5
    cyl('EA_J3_Quill','brushed',(x+.027*math.cos(a),y+.027*math.sin(a),1.07),(x+.027*math.cos(a),y+.027*math.sin(a),1.83),.003,8)
for k in range(22): cyl('EA_J3_Quill','rubber',(x,y,1.65+k*.009),(x,y,1.655+k*.009),.047 if k%2 else .042,32)
cyl('EA_J3_Quill','brushed',(x,y,1.875),(x,y,1.91),.047,40)
box('EA_J3_Quill','brushed',(x+.071,y,1.55),(.019,.034,.46),.005)
for k in range(20): box('EA_J3_Quill','darksteel',(x+.081,y-.018,1.34+k*.021),(.012,.003,.002))
# Gripper rotary flange and miniature parallel jaws.
cyl('EA_J4_Tool','darksteel',(x,y,1.04),(x,y,1.08),.058,48)
cyl('EA_J4_Tool','brushed',(x,y,1.019),(x,y,1.04),.062,48)
for k in range(8):
    a=k*math.pi/4; bolt('EA_J4_Tool',(x+.049*math.cos(a),y+.049*math.sin(a),1.014),r=.006)
box('EA_J4_Tool','white',(x,y,.981),(.095,.095,.065),.014)
box('EA_J4_Tool','darksteel',(x,y,.944),(.126,.078,.018),.009)
for side in [-1,1]:
    box('EA_J4_Tool','brushed',(x+side*.048,y,.924),(.027,.055,.026),.004)
    box('EA_J4_Tool','steel',(x+side*.051,y,.891),(.013,.029,.059),.005)
    box('EA_J4_Tool','rubber',(x+side*.042,y,.877),(.008,.028,.026),.002)
for side in [-1,1]:
    cyl('EA_J4_Tool','darksteel',(x+side*.027,y-.056,.983),(x+side*.027,y-.077,.983),.012,16)
# Corrugated cable chains, connectors and fine pneumatic tubing follow individual links.
def loom(g,points,r=.017):
    pipe(g,'black',points,r,12)
    for a,b in zip(points[:-1],points[1:]):
        a,b=Vector(a),Vector(b); d=b-a; n=max(2,int(d.length/.019)); u=d.normalized()
        for k in range(n):
            p=a+d*(k+.5)/n
            cyl(g,'rubber',p-u*.003,p+u*.003,r*1.24,12)
loom('base',[(.08,.12,.18),(.10,.18,.42),(.07,.17,.78),(.07,.17,1.02)],.016)
loom('EA_J1_Base',[(.07,.17,1.02),(.04,.21,1.30),(-.25,.19,1.39),(-.56,.15,1.42)],.020)
loom('EA_J2_Elbow',[(-.58,.14,1.44),(-.70,.12,1.56),(-1.03,-.05,1.61),(-1.18,-.18,1.52)],.018)
loom('EA_J3_Quill',[(x+.09,y+.09,1.55),(x+.11,y+.13,1.23),(x+.08,y+.10,1.09)],.009)
pipe('EA_J4_Tool','brushed',[(x+.08,y+.10,1.09),(x+.08,y+.10,1.0),(x+.045,y+.05,.982)],.005,10)
for g,p in [('base',(.08,.12,.22)),('EA_J1_Base',(-.52,.15,1.40)),('EA_J2_Elbow',(-1.18,-.18,1.52))]:
    cyl(g,'brushed',(p[0],p[1],p[2]),(p[0],p[1],p[2]+.04),.024,24)
    for k in range(4): cyl(g,'darksteel',(p[0],p[1],p[2]+k*.01),(p[0],p[1],p[2]+k*.01+.004),.025,24)
# Compact vision camera on the second arm, physically separate from the rotary TCP.
box('EA_J2_Elbow','darksteel',(-1.06,-.47,1.38),(.080,.073,.097),.012)
cyl('EA_J2_Elbow','black',(-1.06,-.47,1.34),(-1.06,-.47,1.28),.027,24)
cyl('EA_J2_Elbow','glass',(-1.06,-.47,1.283),(-1.06,-.47,1.277),.024,24)
# Rounded bearing engraving rings increase silhouette accuracy around axis housings.
for g,cx,cy,cz,rad in [('EA_J1_Base',0,0,1.02,.148),('EA_J2_Elbow',-.65,0,1.25,.137),('EA_J2_Elbow',x,y,1.31,.104)]:
    for k in range(48):
        a=k*2*math.pi/48
        box(g,'steel',(cx+rad*math.cos(a),cy+rad*math.sin(a),cz),(.006,.013,.026),.001,rot=a)
robot_objects=flush(robotcol)
for ob in robot_objects:
    parent=J.get(ob['equipment_id'],root)
    bpy.context.view_layer.update(); w=ob.matrix_world.copy(); ob.parent=parent; ob.matrix_world=w
# Separate TCP transform is useful to downstream inspection software.
tcp=bpy.data.objects.new('EA_TCP_Micro_Gripper',None); robotcol.objects.link(tcp); tcp.location=(x,y,.861)
bpy.context.view_layer.update(); w=tcp.matrix_world.copy(); tcp.parent=J['EA_J4_Tool']; tcp.matrix_world=w

# Export only this scene's own collections; inspect RNA enum before choosing a format.
def export_collection(collection,filepath):
    for ob in scene.objects: ob.select_set(False)
    obs=[ob for ob in collection.all_objects]
    for ob in obs: ob.select_set(True)
    if obs: bpy.context.view_layer.objects.active=obs[0]
    enum={item[0] for item in io_scene_gltf2.get_format_items(None, bpy.context)}
    if 'GLB' not in enum: raise RuntimeError('GLB export is not available: '+str(enum))
    bpy.ops.export_scene.gltf(filepath=filepath,export_format='GLB',use_selection=True,use_active_scene=True,export_extras=True,export_apply=False)

def mesh_stats(obs):
    meshes=[o for o in obs if o.type=='MESH']; triangles=0
    for ob in meshes:
        ob.data.calc_loop_triangles(); triangles+=len(ob.data.loop_triangles)
    return triangles,len(meshes)
# Register physical bounds; fonts are deliberately excluded from equipment collision envelopes.
equipment=[]
bpy.context.view_layer.update()
for g,e in EQ.items():
    vertices=[]
    for ob in factory_objects:
        if ob.get('equipment_id')==g:
            vertices.extend([ob.matrix_world@Vector(v) for v in ob.bound_box])
    if not vertices: raise RuntimeError('No collision geometry for '+g)
    xmin,xmax=min(v.x for v in vertices),max(v.x for v in vertices)
    ymin,ymax=min(v.y for v in vertices),max(v.y for v in vertices)
    equipment.append({'id':g,'name':e['name'],'category':e['category'],'footprint':{'kind':'rect','center':{'x':round((xmin+xmax)/2,4),'y':round((ymin+ymax)/2,4)},'width':round(xmax-xmin,4),'depth':round(ymax-ymin,4)},'blocksBase':True,'sweepPolicy':'work-target' if e['work'] else 'advisory'})
ft,fm=mesh_stats(factory_objects); rt,rm=mesh_stats(robot_objects)
metadata={
'slug':'electronics-assembly','title':'전자부품 정밀 조립 공장','shortTitle':'전자 조립','industry':'전자·반도체','description':'SMT 실장·리플로·AOI 라인과 정밀 SCARA 조립·전기 검사를 연결하는 ESD 클린룸입니다. 피더 릴, PCB 지그, 현미경 리워크 작업대와 청정 공조를 세부 모델링했습니다.',
'robotDescription':'4축 SCARA · 수직 퀼 · 정밀 평행 그리퍼 · 가상 제원',
'scenario':{'schemaVersion':'1.0','id':'electronics-assembly-v1','name':'전자부품 정밀 조립·전기 검사 셀',
'factory':{'width':22,'depth':18,'center':{'x':0,'y':0}},'cell':{'kind':'rect','center':{'x':.30,'y':.40},'width':6.6,'depth':5.4},
'robot':{'name':'SC-1400 Precision SCARA','reach':1.40,'footprintDiameter':.44,'safetyBuffer':.25,'payloadKg':4},
 'targets':[{'id':'pick','name':'PCB 공급 지그','position':{'x':-1.05,'y':-.47},'equipmentId':'pcb_input_fixture'},{'id':'place','name':'전기 검사 지그','position':{'x':1.05,'y':-.47},'equipmentId':'electrical_test_fixture'}],
 'equipment':equipment,
 'candidates':[{'id':'A','name':'지그 사이 정밀 조립 위치','position':{'x':0,'y':.12},'description':'양쪽 PCB 지그를 함께 다루는 셀 중앙 후보입니다.'},{'id':'B','name':'후방 서비스 공간 후보','position':{'x':0,'y':1.40},'description':'후방 유지보수 공간은 확보되지만 지그까지 거리가 늘어나는 후보입니다.'},{'id':'C','name':'제어반 측면 후보','position':{'x':2.80,'y':.80},'description':'제어반과의 실제 설치 간섭을 비교하기 위한 후보입니다.'}],
 'pathways':[{'id':'worker','name':'ESD 작업자 보행 통로','kind':'worker','width':1.0,'points':[{'x':-9.9,'y':-1.90},{'x':3.9,'y':-1.90},{'x':3.9,'y':6.5}]},{'id':'cart','name':'PCB 카트 물류 동선','kind':'cart','width':1.2,'points':[{'x':-9.9,'y':-5.4},{'x':3.8,'y':-5.4},{'x':3.8,'y':6.6}]}],
 'roi':{'investment':92000000,'workersBefore':2,'workersAfter':1,'hoursPerDay':8,'daysPerMonth':22,'hourlyWage':23000,'monthlyMaintenance':420000}},
 'camera':{'cellOffset':[3.25,3.1,4.5],'targetHeight':1.05,'overviewPosition':[22,23,28]},
 'stats':{'factoryTriangles':ft,'robotTriangles':rt,'factoryMeshes':fm,'robotMeshes':rm},
 'provenance':'Original Blender MCP procedural virtual testbed; not measured plant/OEM CAD'
}
with open(os.path.join(OUT,'layout.json'),'w',encoding='utf-8') as f: json.dump(metadata,f,ensure_ascii=False,indent=2)
export_collection(factory,os.path.join(OUT,'factory.glb'))
export_collection(robotcol,os.path.join(OUT,'robot.glb'))
# Move standalone root after export for native .blend and scene render.
root.location=(0,.12,0)
world=bpy.data.worlds.new('EA_Studio_Neutral'); world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND'); bg.inputs['Color'].default_value=(.40,.40,.40,1); bg.inputs['Strength'].default_value=.55
scene.world=world
for name,loc,energy,size in [('EA_Key',(4,-5,11),2400,8),('EA_Fill',(-7,-2,9),1900,7),('EA_Rim',(0,7,10),2300,8)]:
    data=bpy.data.lights.new(name,new_enum_value(bpy.types.BlendDataLights,'new','type','AREA')); data.energy=energy; choose_enum(data,'shape','DISK'); data.size=size
    ob=bpy.data.objects.new(name,data); studio.objects.link(ob); ob.location=loc; ob.rotation_euler=(Vector((0,1,0))-ob.location).to_track_quat('-Z','Y').to_euler()
cdata=bpy.data.cameras.new('EA_Overview_Camera'); cam=bpy.data.objects.new('EA_Overview_Camera',cdata); studio.objects.link(cam)
cam.location=(20,-25,23); cam.rotation_euler=(Vector((0,0,1))-cam.location).to_track_quat('-Z','Y').to_euler()
camtypes={i.identifier for i in cdata.bl_rna.properties['type'].enum_items}
if 'ORTHO' not in camtypes: raise RuntimeError('Orthographic camera unsupported')
cdata.type='ORTHO'; cdata.ortho_scale=30.0; scene.camera=cam
scene.render.resolution_x=1200; scene.render.resolution_y=750; scene.render.resolution_percentage=100
previous_engine=scene.render.engine
engines={i.identifier for i in scene.render.bl_rna.properties['engine'].enum_items}
render_engine=next((v for v in ['BLENDER_EEVEE','BLENDER_EEVEE_NEXT','CYCLES','BLENDER_WORKBENCH'] if v in engines),previous_engine)
choose_enum(scene.render,'engine',render_engine)
if render_engine=='CYCLES': scene.cycles.samples=20
png_enum={i.identifier for i in scene.render.image_settings.bl_rna.properties['file_format'].enum_items}
if 'PNG' not in png_enum: raise RuntimeError('PNG output unavailable')
scene.render.image_settings.file_format='PNG'; scene.render.filepath=os.path.join(OUT,'thumbnail.png')
scene.render.film_transparent=False
# Save only owned scene with dependencies; previous user scenes remain untouched in memory.
bpy.data.libraries.write(os.path.join(OUT,'scene.blend'),{scene},fake_user=True,compress=True)
# Convenient live Blender framing, separate from exported cameras.
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_distance=28
            area.spaces.active.region_3d.view_location=(0,0,1)
            area.spaces.active.region_3d.view_rotation=cam.rotation_euler.to_quaternion()
print(json.dumps({'slug':'electronics-assembly','factoryTriangles':ft,'robotTriangles':rt,'factoryMeshes':fm,'robotMeshes':rm,'equipment':len(equipment),'factoryBytes':os.path.getsize(os.path.join(OUT,'factory.glb')),'robotBytes':os.path.getsize(os.path.join(OUT,'robot.glb')),'outputs':OUT}))
