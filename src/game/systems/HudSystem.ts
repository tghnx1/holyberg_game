import Phaser from 'phaser'; import {Depth,DESIGN_WIDTH} from '../constants'; import type {BerlinProgress} from '../types/game';
import type {ViewportInfo} from '../responsive/ViewportInfo';
const style={fontFamily:'Space Mono',fontSize:'22px',color:'#ffffff',stroke:'#10091d',strokeThickness:6};
export class HudSystem{
  time:Phaser.GameObjects.Text;score:Phaser.GameObjects.Text;message:Phaser.GameObjects.Text;jump:Phaser.GameObjects.Container;
  constructor(scene:Phaser.Scene,onJump:()=>void,uiLayer?:Phaser.GameObjects.Layer){
    this.time=scene.add.text(32,24,'',style);this.score=scene.add.text(DESIGN_WIDTH-32,24,'',style).setOrigin(1,0);
    this.message=scene.add.text(DESIGN_WIDTH/2,90,'',{...style,fontSize:'26px',align:'center'}).setOrigin(.5).setAlpha(0);
    const circle=scene.add.circle(0,0,58,0xff4f23,.82).setStrokeStyle(4,0xffce69);const label=scene.add.text(0,0,'JUMP',{...style,fontSize:'16px'}).setOrigin(.5);this.jump=scene.add.container(DESIGN_WIDTH-90,620,[circle,label]).setSize(120,120).setInteractive();this.jump.on('pointerdown',onJump);
    const objects=[this.time,this.score,this.message,this.jump];
    for(const object of objects)object.setScrollFactor(0).setDepth(Depth.UI);
    uiLayer?.add(objects);
  }
  update(p:BerlinProgress){this.time.setText(`TIME  ${Math.ceil(p.seconds)}`);this.score.setText(`SCORE  ${p.score}\nUSB  ${p.hasUsb?'✓':'—'}`);}
  flash(text:string,duration=1400){this.message.setText(text).setAlpha(1);this.message.scene.tweens.killTweensOf(this.message);this.message.scene.tweens.add({targets:this.message,alpha:0,delay:duration,duration:350});}
  applyLayout(viewport:ViewportInfo){
    const margin=viewport.safeMargin;
    this.time.setPosition(margin,margin).setScale(viewport.hudScale);
    this.score.setPosition(DESIGN_WIDTH-margin,margin).setScale(viewport.hudScale);
    this.message.setPosition(DESIGN_WIDTH/2,margin+66).setScale(viewport.hudScale);
    this.jump.setPosition(DESIGN_WIDTH-margin-58,720-margin-58).setScale(viewport.compactLandscape?.86:1);
    this.jump.setSize(Math.max(80,viewport.touchControlSize),Math.max(80,viewport.touchControlSize));
  }
}
