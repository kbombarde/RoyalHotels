import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160/build/three.module.js';

// ========================
const TRACK_LENGTH = 30;
const TRACK_COUNT = 10;

let SPEED = 20;
let LEVEL = 1;

// ========================
const scoreEl = document.getElementById('score');
const comboEl = document.getElementById('combo');
const menu = document.getElementById('menu');

// ========================
// SOUND
// ========================
const sounds = {
  coin: new Audio('./assets/sounds/coin.mp3'),
  jump: new Audio('./assets/sounds/jump.mp3'),
  duck: new Audio('./assets/sounds/duck.mp3'),
  lane: new Audio('./assets/sounds/swish.mp3')
};

Object.values(sounds).forEach(s=>{
  s.volume=0.5;
  s.preload='auto';
});

let audioUnlocked=false;

function unlockAudio(){
  if(audioUnlocked) return;
  Object.values(sounds).forEach(s=>{
    s.play().then(()=>s.pause()).catch(()=>{});
  });
  audioUnlocked=true;
}

function playSound(name){
  if(!audioUnlocked) return;
  const s=sounds[name].cloneNode();
  s.volume=0.5;
  s.play().catch(()=>{});
}

// ========================
// TEXTURES
// ========================
const loader=new THREE.TextureLoader();

const groundTex=loader.load('./assets/textures/ground.png');
const railTex=loader.load('./assets/textures/rail.png');
const coinTex=loader.load('./assets/textures/coin.png');
const barricadeTex=loader.load('./assets/textures/barricade.png');
const barTex=loader.load('./assets/textures/bar.png');
const barrelTex=loader.load('./assets/textures/barrel.png');

[groundTex,railTex].forEach(t=>{
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
});

// ========================
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x87ceeb);

const camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,1000);

const renderer=new THREE.WebGLRenderer({
  canvas:document.getElementById('game'),
  antialias:true
});
renderer.setSize(window.innerWidth,window.innerHeight);

scene.add(new THREE.AmbientLight(0xffffff,0.8));

// ========================
let lane=0,y=1.5,velocityY=0;
let isJumping=false,isDucking=false;

let score=0,gameOver=true;
let bobTime=0;

let combo=1,comboTimer=0;

// ========================
const track=[];

function createTrack(z){
  const g=new THREE.Group();

  const ground=new THREE.Mesh(
    new THREE.BoxGeometry(12,0.2,TRACK_LENGTH),
    new THREE.MeshStandardMaterial({map:groundTex})
  );
  ground.position.set(0,0,z);
  g.add(ground);

  [-2,0,2].forEach(x=>{
    const rail=new THREE.Mesh(
      new THREE.BoxGeometry(0.25,0.25,TRACK_LENGTH),
      new THREE.MeshStandardMaterial({map:railTex})
    );
    rail.position.set(x,0.15,z);
    g.add(rail);
  });

  scene.add(g);
  return g;
}

for(let i=0;i<TRACK_COUNT;i++){
  track.push(createTrack(-i*TRACK_LENGTH));
}

// ========================
const coins=[];
const obstacles=[];
const particles=[];

// ========================
function spawnCoin(){
  const x=(LEVEL===1)?0:[-2,0,2][Math.random()*3|0];

  const c=new THREE.Mesh(
    new THREE.PlaneGeometry(0.8,0.8),
    new THREE.MeshBasicMaterial({map:coinTex,transparent:true})
  );

  c.position.set(x,1.5,-60);
  c.userData.collected=false;

  scene.add(c);
  coins.push(c);
}

// ========================
function spawnObstacle(){

  if(LEVEL===1) return;

  if(LEVEL===2){
    [-2,0,2].forEach(x=>createObstacle(x,'jump'));
    return;
  }

  if(LEVEL===3){
    if(Math.random()<0.7){
      [-2,0,2].forEach(x=>createObstacle(x,'duck'));
    } else {
      createObstacle(0,'jump');
    }
    return;
  }

  if(LEVEL===4){
    const lanes=[-2,0,2];
    const open=Math.floor(Math.random()*3);

    lanes.forEach((x,i)=>{
      if(i!==open) createObstacle(x,'side');
    });
    return;
  }

  const types=['jump','duck','side'];
  createObstacle([-2,0,2][Math.random()*3|0],types[Math.random()*3|0]);
}

// ========================
function createObstacle(x,type){

  let mesh;

  if(type==='jump'){
    mesh=new THREE.Mesh(
      new THREE.PlaneGeometry(2,1.5),
      new THREE.MeshBasicMaterial({map:barricadeTex,transparent:true})
    );
    mesh.position.set(x,1,-60);
  }

  if(type==='duck'){
    mesh=new THREE.Mesh(
      new THREE.PlaneGeometry(2.5,1),
      new THREE.MeshBasicMaterial({map:barTex,transparent:true})
    );
    mesh.position.set(x,2,-60);
  }

  if(type==='side'){
    mesh=new THREE.Mesh(
      new THREE.PlaneGeometry(1.2,1.2),
      new THREE.MeshBasicMaterial({map:barrelTex,transparent:true})
    );
    mesh.position.set(x,0.8,-60);
  }

  mesh.userData.type=type;

  scene.add(mesh);
  obstacles.push(mesh);
}

// ========================
window.addEventListener('keydown',e=>{
  unlockAudio();

  if(gameOver) return;

  if(e.key==='ArrowLeft'){ lane=Math.max(-1,lane-1); playSound('lane'); }
  if(e.key==='ArrowRight'){ lane=Math.min(1,lane+1); playSound('lane'); }

  if(e.key==='ArrowUp'&&!isJumping){
    velocityY=8;
    isJumping=true;
    playSound('jump');
  }

  if(e.key==='ArrowDown'){
    isDucking=true;
    playSound('duck');
    setTimeout(()=>isDucking=false,400);
  }
});

// ========================
window.startGame=()=>{
  LEVEL=parseInt(document.getElementById('level').value);
  menu.style.display='none';

  score=0;
  combo=1;
  gameOver=false;

  SPEED = 20 + (LEVEL*2);
};

// ========================
const clock=new THREE.Clock();
let coinTimer=0, obstacleTimer=0;

function animate(){
  requestAnimationFrame(animate);
  const delta=clock.getDelta();

  if(!gameOver){

    comboTimer-=delta;
    if(comboTimer<=0){
      combo=1;
      comboEl.style.opacity=0;
    }

    velocityY-=20*delta;
    y+=velocityY*delta;

    if(y<=1.5){
      y=1.5;
      velocityY=0;
      isJumping=false;
    }

    bobTime+=delta*10;
    const bob=Math.sin(bobTime)*0.1;

    camera.position.x+=(lane*2-camera.position.x)*0.2;
    camera.position.y=y+bob;
    camera.position.z=5;

    camera.lookAt(camera.position.x,camera.position.y,-20);

    let farZ=Infinity;

    for(const t of track){
      t.position.z+=SPEED*delta;
      if(t.position.z<farZ) farZ=t.position.z;
    }

    for(const t of track){
      if(t.position.z>TRACK_LENGTH){
        t.position.z=farZ-TRACK_LENGTH;
      }
    }

    // coins
    coinTimer+=delta;
    if(coinTimer>0.6){
      spawnCoin();
      coinTimer=0;
    }

    // obstacles
    obstacleTimer+=delta;

    let baseRate=1.2-(LEVEL*0.1);
    if(baseRate<0.5) baseRate=0.5;

    if(obstacleTimer>baseRate){
      spawnObstacle();
      obstacleTimer=0;
    }

    // update objects
    [...coins,...obstacles].forEach(obj=>{
      obj.lookAt(camera.position);
      obj.position.z+=SPEED*delta;
    });

    // collision
    obstacles.forEach(o=>{
      const hit=Math.abs(o.position.z-camera.position.z)<1 &&
                 Math.abs(o.position.x-camera.position.x)<1;

      if(hit){
        if(o.userData.type==='jump' && (!isJumping||y<=1.6)) gameOver=true;
        if(o.userData.type==='duck' && !isDucking) gameOver=true;
        if(o.userData.type==='side') gameOver=true;
      }
    });

    // coins
    coins.forEach(c=>{
      const hit=Math.abs(c.position.z-camera.position.z)<1 &&
                 Math.abs(c.position.x-camera.position.x)<1;

      if(hit && !c.userData.collected){
        c.userData.collected=true;

        playSound('coin');

        combo=Math.min(combo+1,5);
        comboTimer=2;

        score+=10*combo;
        scoreEl.innerText=score;

        comboEl.innerText='x'+combo;
        comboEl.style.opacity=1;
      }
    });
  }

  renderer.render(scene,camera);
}

animate();