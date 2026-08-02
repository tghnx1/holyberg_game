import Phaser from 'phaser'; import {Depth,GROUND_Y,JUMP_VELOCITY,RUN_SPEED} from '../constants';
export class Player extends Phaser.Physics.Arcade.Sprite{
  constructor(scene:Phaser.Scene,x:number){super(scene,x,GROUND_Y-55,'dj');scene.add.existing(this);scene.physics.add.existing(this);this.setDepth(Depth.PLAYER).setCollideWorldBounds(true);this.body!.setSize(38,80).setOffset(21,16);}
  run(){this.setVelocityX(RUN_SPEED);this.rotation=Math.sin(this.scene.time.now/80)*.025;}
  halt(){this.setVelocityX(0);this.rotation=0;}
  jump(){const body=this.body as Phaser.Physics.Arcade.Body;if(body.blocked.down)this.setVelocityY(JUMP_VELOCITY);}
}
