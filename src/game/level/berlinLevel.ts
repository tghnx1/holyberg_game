import Phaser from 'phaser'; import {Depth,GROUND_Y,WORLD_WIDTH} from '../constants';
export interface ObstacleSpec{x:number;y:number;width:number;height:number;kind:'barrier'|'scooter'|'bag'|'car'|'night-creature'}
export const OBSTACLES:ObstacleSpec[]=[{x:1150,y:GROUND_Y-30,width:68,height:54,kind:'barrier'},{x:1580,y:GROUND_Y-28,width:70,height:45,kind:'scooter'},{x:2080,y:GROUND_Y-20,width:48,height:36,kind:'bag'},{x:3420,y:GROUND_Y-35,width:110,height:64,kind:'night-creature'},{x:4720,y:GROUND_Y-40,width:150,height:70,kind:'car'}];
const rect=(s:Phaser.Scene,x:number,y:number,w:number,h:number,c:number,d:number=Depth.MID_BACKGROUND)=>s.add.rectangle(x,y,w,h,c).setDepth(d);
export function buildBerlinWorld(s:Phaser.Scene){
  rect(s,WORLD_WIDTH/2,GROUND_Y+55,WORLD_WIDTH,110,0x100c1b,Depth.GAMEPLAY);
  // Apartment
  rect(s,400,360,800,500,0x2a1738);rect(s,130,530,210,65,0x5c365f);rect(s,130,492,160,25,0x9b6382);rect(s,410,520,170,90,0x44263e);rect(s,410,470,130,22,0xe8a22c);rect(s,650,360,150,200,0x713557);rect(s,650,360,120,165,0x221b45);s.add.text(650,575,'EXIT',{fontFamily:'Space Mono',fontSize:'15px',color:'#ffca57'}).setOrigin(.5).setDepth(Depth.MID_BACKGROUND);
  // Street buildings and street furniture
  for(let x=850;x<2400;x+=240){const h=260+((x/10)%3)*45;rect(s,x,GROUND_Y-h/2,220,h,x%480===0?0x4a294e:0x33263f);for(let wy=GROUND_Y-h+45;wy<GROUND_Y-40;wy+=65)for(let wx=x-75;wx<x+85;wx+=50)rect(s,wx,wy,24,34,0xee8248);}
  s.add.text(1120,300,'SPÄTI',{fontFamily:'Archivo Black',fontSize:'42px',color:'#ffdf55',backgroundColor:'#e93c54'}).setOrigin(.5).setDepth(Depth.MID_BACKGROUND);s.add.text(1890,465,'NO SLEEP\nJUST BASS',{fontFamily:'Archivo Black',fontSize:'25px',color:'#b9ff66',align:'center'}).setAngle(-6).setDepth(Depth.MID_BACKGROUND);
  // Bridge showcase: sunset, river, sun, skyline, arches, towers, train
  rect(s,3350,300,1900,620,0x502159,Depth.SKY);s.add.circle(3300,250,120,0xffb044).setDepth(Depth.FAR_BACKGROUND);rect(s,3350,540,1900,140,0x34235d,Depth.FAR_BACKGROUND);
  for(let x=2500;x<4300;x+=150)rect(s,x,475,120,100+(x%300),0x221b3f,Depth.FAR_BACKGROUND);
  for(let x=2520;x<4250;x+=230){s.add.ellipse(x,505,210,150,0xd65d43).setDepth(Depth.MID_BACKGROUND);s.add.ellipse(x,520,160,120,0x34235d).setDepth(Depth.MID_BACKGROUND);rect(s,x,510,18,150,0x73314b);}
  for(const x of [2640,4070]){rect(s,x,365,115,290,0x7d3e52);s.add.triangle(x,175,0,110,58,0,116,110,0xa54954).setDepth(Depth.MID_BACKGROUND);}
  rect(s,3360,410,1100,35,0xf0bd38);s.add.text(3360,408,'U  U  U  U  U  U  U  U  U',{fontFamily:'Space Mono',fontSize:'19px',color:'#171221'}).setOrigin(.5).setDepth(Depth.MID_BACKGROUND);
  // Club district
  rect(s,5150,315,1700,590,0x121021,Depth.SKY);for(let x=4380;x<6000;x+=260){rect(s,x,390,230,440,x%520?0x19172a:0x24132e);rect(s,x,350,150,8,x%520?0xe94373:0x8a41ff);}
  s.add.text(4950,360,'HOLYBERG',{fontFamily:'Archivo Black',fontSize:'58px',color:'#ff3e68',stroke:'#7128b8',strokeThickness:5}).setOrigin(.5).setDepth(Depth.MID_BACKGROUND);s.add.text(5230,480,'TONIGHT\nNO SIGNAL\nALL NIGHT',{fontFamily:'Space Mono',fontSize:'22px',color:'#ffba45',align:'center'}).setOrigin(.5).setAngle(4).setDepth(Depth.MID_BACKGROUND);
  rect(s,5740,485,170,250,0x08070c,Depth.MID_BACKGROUND);rect(s,5740,370,210,35,0xec315f,Depth.MID_BACKGROUND);s.add.text(5740,370,'BACKSTAGE',{fontFamily:'Archivo Black',fontSize:'21px',color:'#fff'}).setOrigin(.5).setDepth(Depth.MID_BACKGROUND);
  // Fernsehturm silhouettes
  for(const x of [2200,3900]){rect(s,x,315,12,310,0x1a1733,Depth.FAR_BACKGROUND);s.add.circle(x,255,42,0x27203f).setDepth(Depth.FAR_BACKGROUND);}
}
