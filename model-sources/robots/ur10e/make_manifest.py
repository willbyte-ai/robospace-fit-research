import math,json
from pathlib import Path
HOME=[180,-75,50,-65,-90,0]
A=[0,-.6127,-.57155,0,0,0]
D=[.1807,0,0,.17415,.11985,.11655]
ALPHA=[math.pi/2,0,0,math.pi/2,-math.pi/2,0]
def mm(a,b): return [[sum(a[i][k]*b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]
def dh(t,a,d,al):
 c,s,ca,sa=math.cos(t),math.sin(t),math.cos(al),math.sin(al)
 return [[c,-s*ca,s*sa,a*c],[s,c*ca,-c*sa,a*s],[0,sa,ca,d],[0,0,0,1]]
t=[[int(i==j) for j in range(4)] for i in range(4)]
joints=[]
for i in range(6):
 joints.append({'name':f'J{i+1}','label':['베이스 회전','숄더','엘보','손목 1','손목 2','툴 회전'][i],'pivot':[round(t[k][3],8) for k in range(3)],'axis':[round(t[k][2],8) for k in range(3)],'minDeg':-360,'maxDeg':360,'maxSpeedDeg':120 if i<2 else 180,'homeDeg':HOME[i]})
 t=mm(t,dh(math.radians(HOME[i]),A[i],D[i],ALPHA[i]))
flange=[round(t[k][3],8) for k in range(3)]
toolaxis=[round(t[k][2],8) for k in range(3)]
tcp=[round(flange[k]+.155*toolaxis[k],8) for k in range(3)]
m={'id':'ur10e','name':'UR10e','manufacturer':'Universal Robots','category':'협동 로봇 · 6축','description':'알루미늄 링크와 푸른 관절 커버의 범용 협동 로봇. 픽앤플레이스·머신텐딩용 평행 그리퍼를 구성했습니다.','reach':1.3,'payloadKg':12.5,'footprintDiameter':.19,'massKg':33.5,'joints':joints,'tcp':tcp,'flange':flange,'toolAxis':toolaxis,'toolLength':.155,'sources':[{'title':'UR10e official technical specification · December 2024','url':'https://www.universal-robots.com/media/1807466/ur10e_e-series_datasheets_web.pdf'},{'title':'Universal Robots nominal DH parameters','url':'https://www.universal-robots.com/developer/hardware-and-motion/robot-motion-dh-parameters/'}],'note':'제조사 공개 사진을 참고한 독자 제작 외관 모델입니다. 명목 DH 치수와 공시 관절 범위·속도를 사용하며 외장·그리퍼 치수는 근사값입니다. 제조사 CAD·실기 보정·안전 인증 모델이 아닙니다. 공시 도달거리 1.3 m는 플랜지 기준이며 0.155 m 예시 그리퍼가 추가됩니다.','kinematics':'UR published nominal standard DH, home [180, -75, 50, -65, -90, 0] degrees; axes are world axes at reference pose; all EMPTY rotations identity; runtime angle minus homeDeg','dh':{'a':A,'d':D,'alphaRad':ALPHA}}
Path('/tmp/robospace-robots/ur10e/manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2))
print(json.dumps({'joints':joints,'tcp':tcp,'flange':flange},indent=2))
