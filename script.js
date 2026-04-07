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

// ========================
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x87ceeb);

const camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,0.1,1000);

const renderer=new THREE.WebGLRenderer({
  canvas:document.getElementById('game'),
  antialias:true
});
renderer.setSize(innerWidth,innerHeight);

scene.add(new THREE.AmbientLight(0xffffff,0.8));

// ========================
let lane=0,y=1.5,velocityY=0;
let isJumping=false,isDucking=false;

let score=0,gameOver=true;
let combo=1,comboTimer=0;

let bobTime=0;
let shakeTime=0;

// ========================
// TRACK
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
// OBJECTS
// ========================
const coins=[];
const obstacles=[];
const particles=[];

// ========================
// COINS (✨ glow + trail)
// ========================
function spawnCoin(){
  const x=(LEVEL===1)?0:[-2,0,2][Math.random()*3|0];

  const mat=new THREE.MeshBasicMaterial({
    map:coinTex,
    transparent:true,
    emissive:new THREE.Color(0xffd700),
    emissiveIntensity:0.5
  });

  const c=new THREE.Mesh(
    new THREE.PlaneGeometry(0.8,0.8),
    mat
  );

  c.position.set(x,1.5,-60);
  c.userData.collected=false;

  scene.add(c);
  coins.push(c);
}

// ========================
// PARTICLES (💫 subtle)
// ========================
function spawnParticles(x,y,z){
  for(let i=0;i<4;i++){
    const p=new THREE.Mesh(
      new THREE.SphereGeometry(0.03,4,4),
      new THREE.MeshBasicMaterial({
        color:0xffd700,
        transparent:true,
        opacity:0.8
      })
    );

    p.position.set(x,y,z);
    p.userData.life=0.5;
    p.userData.vel={
      x:(Math.random()-0.5)*0.5,
      y:Math.random()*0.8,
      z:(Math.random()-0.5)*0.5
    };

    scene.add(p);
    particles.push(p);
  }
}

// ========================
// OBSTACLES (same logic)
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
// CONTROLS
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

  SPEED=20+(LEVEL*2);
};

// ========================
const clock=new THREE.Clock();
let coinTimer=0, obstacleTimer=0;

// ========================
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
    if(y<=1.5){ y=1.5; isJumping=false; }

    bobTime+=delta*10;
    const bob=Math.sin(bobTime)*0.1;

    let shakeX=0,shakeY=0;
    if(shakeTime>0){
      shakeX=(Math.random()-0.5)*0.2;
      shakeY=(Math.random()-0.5)*0.2;
      shakeTime-=delta;
    }

    camera.position.set(lane*2+shakeX,y+bob+shakeY,5);
    camera.lookAt(camera.position.x,camera.position.y,-20);

    // track
    let farZ=Infinity;
    track.forEach(t=>{
      t.position.z+=SPEED*delta;
      if(t.position.z<farZ) farZ=t.position.z;
    });
    track.forEach(t=>{
      if(t.position.z>TRACK_LENGTH){
        t.position.z=farZ-TRACK_LENGTH;
      }
    });

    // spawn coins
    coinTimer+=delta;
    if(coinTimer>0.6){
      spawnCoin();
      coinTimer=0;
    }

    // spawn obstacles
    obstacleTimer+=delta;
    if(obstacleTimer>0.7){
      spawnObstacle();
      obstacleTimer=0;
    }

    // update objects
    [...coins,...obstacles].forEach(obj=>{
      obj.lookAt(camera.position);
      obj.position.z+=SPEED*delta;
    });

    // coin trail + collect
    coins.forEach(c=>{
      spawnParticles(c.position.x,c.position.y,c.position.z);

      const hit=Math.abs(c.position.z-camera.position.z)<1 &&
                 Math.abs(c.position.x-camera.position.x)<1;

      if(hit && !c.userData.collected){
        c.userData.collected=true;

        playSound('coin');
        spawnParticles(c.position.x,c.position.y,c.position.z);

        combo=Math.min(combo+1,5);
        comboTimer=2;

        score+=10*combo;
        scoreEl.innerText=score;

        comboEl.innerText='x'+combo;
        comboEl.style.opacity=1;
      }
    });

    // particles update
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i];

      p.position.x+=p.userData.vel.x;
      p.position.y+=p.userData.vel.y;
      p.position.z+=p.userData.vel.z;

      p.material.opacity-=delta*2;
      p.userData.life-=delta;

      if(p.userData.life<=0){
        scene.remove(p);
        particles.splice(i,1);
      }
    }

    // collision
    obstacles.forEach(o=>{
      const hit=Math.abs(o.position.z-camera.position.z)<1 &&
                 Math.abs(o.position.x-camera.position.x)<1;

      if(hit){
        shakeTime=0.3;
        document.body.classList.add('hit');
        setTimeout(()=>document.body.classList.remove('hit'),100);
        gameOver=true;
      }
    });
  }

  renderer.render(scene,camera);
}

animate();