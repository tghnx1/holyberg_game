import Phaser from 'phaser'; import {Depth} from '../constants'; import {OBSTACLES} from '../level/berlinLevel';
export class ObstacleSystem{
 readonly zones:Phaser.Physics.Arcade.StaticGroup;
 constructor(scene:Phaser.Scene){this.zones=scene.physics.add.staticGroup();for(const o of OBSTACLES){const colors={barrier:0xf05b35,scooter:0x7cd4ce,bag:0x433849,car:0x884978,'night-creature':0x3c244f};scene.add.rectangle(o.x,o.y,o.width,o.height,colors[o.kind]).setDepth(Depth.GAMEPLAY).setStrokeStyle(4,0x14101e);scene.add.text(o.x,o.y,o.kind==='night-creature'?'NIGHT\nCREATURE':o.kind.toUpperCase(),{fontFamily:'Space Mono',fontSize:'11px',color:'#fff',align:'center'}).setOrigin(.5).setDepth(Depth.GAMEPLAY);const z=scene.add.zone(o.x,o.y,o.width*.75,o.height*.8);scene.physics.add.existing(z,true);this.zones.add(z);}}
}
