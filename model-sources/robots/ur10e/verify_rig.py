import json, math, random
m=json.load(open('/tmp/robospace-robots/ur10e/manifest.json'))
def mm(a,b):return [[sum(a[i][k]*b[k][j] for k in range(4))for j in range(4)]for i in range(4)]
def identity():return [[int(i==j) for j in range(4)]for i in range(4)]
def tr(p):
 t=identity()
 for i in range(3):t[i][3]=p[i]
 return t
def rot(axis,t):
 x,y,z=axis;c=math.cos(t);s=math.sin(t);C=1-c
 return [[c+x*x*C,x*y*C-z*s,x*z*C+y*s,0],[y*x*C+z*s,c+y*y*C,y*z*C-x*s,0],[z*x*C-y*s,z*y*C+x*s,c+z*z*C,0],[0,0,0,1]]
def dh(t,a,d,al):
 c,s,ca,sa=math.cos(t),math.sin(t),math.cos(al),math.sin(al)
 return [[c,-s*ca,s*sa,a*c],[s,c*ca,-c*sa,a*s],[0,sa,ca,d],[0,0,0,1]]
maxerr=0
for n in range(100):
 q=[random.uniform(-180,180)for _ in range(6)];t=identity();prev=[0,0,0]
 for j,a in zip(m['joints'],q):
  t=mm(mm(t,tr([j['pivot'][k]-prev[k]for k in range(3)])),rot(j['axis'],math.radians(a-j['homeDeg'])));prev=j['pivot']
 t=mm(t,tr([m['tcp'][k]-prev[k]for k in range(3)]));nom=identity()
 for i in range(6):nom=mm(nom,dh(math.radians(q[i]),m['dh']['a'][i],m['dh']['d'][i],m['dh']['alphaRad'][i]))
 nom=mm(nom,tr([0,0,m['toolLength']]))
 err=math.sqrt(sum((t[k][3]-nom[k][3])**2 for k in range(3)));maxerr=max(err,maxerr)
 assert err<1e-6,(n,err)
print(f'100 random poses: transformed-rest-pivot FK agrees with published DH; worst TCP error {maxerr:.10f} m')
