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

let audioUnlocked = false;

function unlockAudio(){
  if(audioUnlocked) return;
  Object.values(sounds).forEach(s=>{
    s.play().then(()=>s.pause()).catch(()=>{});
  });
  audioUnlocked = true;
}

function playSound(name){
  if(!audioUnlocked) return;
  const s = sounds[name].cloneNode();
  s.volume = 0.5;
  s.play().catch(()=>{});
}

// ========================
// TEXTURES
// ========================
const loader = new THREE.TextureLoader();

const groundTex = loader.load('./assets/textures/ground.png');
const railTex = loader.load('./assets/textures/rail.png');
const coinTex = loader.load('./assets/textures/coin.png');
const barricadeTex = loader.load('./assets/textures/barricade.png');
const barTex = loader.load('./assets/textures/bar.png');
const barrelTex = loader.load('./assets/textures/barrel.png');

// ========================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 20, 150);

const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('game'),
  antialias: true
});
renderer.setSize(innerWidth, innerHeight);

// ========================
// LIGHTING
// ========================
scene.add(new THREE.AmbientLight(0xffffff, 0.6));

const light = new THREE.DirectionalLight(0xffffff, 0.7);
light.position.set(5,10,5);
scene.add(light);

// ========================
// PLAYER
// ========================
let lane = 0;
let y = 1.5;
let velocityY = 0;

let isJumping = false;
let isDucking = false;

let score = 0;
let combo = 1;
let comboTimer = 0;
let gameOver = true;

let bobTime = 0;
let landingImpact = 0;

// ========================
// TRACK + CITY ENVIRONMENT
// ========================
const track = [];

function createTrack(z){
  const g = new THREE.Group();

  // ROAD
  const road = new THREE.Mesh(
    new THREE.BoxGeometry(12,0.2,TRACK_LENGTH),
    new THREE.MeshStandardMaterial({color:0x333333})
  );
  road.position.set(0,0,z);
  g.add(road);

  // LANE MARKERS
  [-2,0,2].forEach(x=>{
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.2,0.05,TRACK_LENGTH),
      new THREE.MeshStandardMaterial({color:0xffffff})
    );
    rail.position.set(x,0.11,z);
    g.add(rail);
  });

  // SIDEWALKS
  [-6,6].forEach(x=>{
    const sidewalk = new THREE.Mesh(
      new THREE.BoxGeometry(2,0.2,TRACK_LENGTH),
      new THREE.MeshStandardMaterial({color:0x777777})
    );
    sidewalk.position.set(x,0,z);
    g.add(sidewalk);
  });

  // 🏢 BUILDINGS
  for(let i=0;i<4;i++){
    const height = 3 + Math.random()*5;

    const building = new THREE.Mesh(
      new THREE.BoxGeometry(2,height,2),
      new THREE.MeshStandardMaterial({color:0x888888})
    );

    building.position.set(
      (Math.random()<0.5 ? -9 : 9),
      height/2,
      z + (Math.random()*TRACK_LENGTH - TRACK_LENGTH/2)
    );

    g.add(building);
  }

  // 💡 STREET LIGHTS
  for(let i=0;i<2;i++){
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05,0.05,3),
      new THREE.MeshStandardMaterial({color:0xaaaaaa})
    );

    const lightBulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.15,6,6),
      new THREE.MeshBasicMaterial({color:0xffffaa})
    );

    pole.position.set(-5,1.5,z + (i*TRACK_LENGTH/2 - TRACK_LENGTH/4));
    lightBulb.position.y = 1.5;

    pole.add(lightBulb);
    g.add(pole);
  }

  // 🚗 PARKED CARS
  for(let i=0;i<2;i++){
    const car = new THREE.Mesh(
      new THREE.BoxGeometry(1.5,0.7,3),
      new THREE.MeshStandardMaterial({color:0xff4444})
    );

    car.position.set(
      Math.random()<0.5 ? -5 : 5,
      0.4,
      z + (Math.random()*TRACK_LENGTH - TRACK_LENGTH/2)
    );

    g.add(car);
  }

  scene.add(g);
  return g;
}

for(let i=0;i<TRACK_COUNT;i++){
  track.push(createTrack(-i*TRACK_LENGTH));
}

// ========================
// OBJECTS
// ========================
const coins = [];
const obstacles = [];

// ========================
function spawnCoin(){
  const x = (LEVEL===1)?0:[-2,0,2][Math.random()*3|0];

  const c = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8,0.8),
    new THREE.MeshBasicMaterial({map:coinTex,transparent:true})
  );

  c.position.set(x,1.5,-60);
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

  mesh.userData.type = type;

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

  if(e.key==='ArrowUp' && !isJumping){
    velocityY=9;
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

    velocityY -= 28*delta;
    y += velocityY*delta;

    if(y<=1.5){
      if(isJumping) landingImpact=0.25;
      y=1.5;
      velocityY=0;
      isJumping=false;
    }

    if(landingImpact>0){
      landingImpact -= delta*3;
    }

    bobTime+=delta*10;
    const bob=Math.sin(bobTime)*0.1;

    const duckOffset = isDucking ? -0.6 : 0;
    const impactOffset = Math.max(landingImpact,0);

    camera.position.set(
      lane*2,
      y + bob + duckOffset - impactOffset,
      5
    );

    camera.lookAt(
      camera.position.x,
      camera.position.y - (isDucking ? 0.3 : 0),
      -20
    );

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

    coinTimer+=delta;
    if(coinTimer>0.6){
      spawnCoin();
      coinTimer=0;
    }

    obstacleTimer+=delta;
    let baseRate=1.2-(LEVEL*0.1);
    if(baseRate<0.5) baseRate=0.5;

    if(obstacleTimer>baseRate){
      spawnObstacle();
      obstacleTimer=0;
    }

    coins.forEach((c,i)=>{
      c.lookAt(camera.position);
      c.position.z+=SPEED*delta;

      if(Math.abs(c.position.z-camera.position.z)<1 &&
         Math.abs(c.position.x-camera.position.x)<1){

        scene.remove(c);
        coins.splice(i,1);

        playSound('coin');

        combo=Math.min(combo+1,5);
        comboTimer=2;

        score+=10*combo;
        scoreEl.innerText=score;

        comboEl.innerText='x'+combo;
        comboEl.style.opacity=1;
      }

      if(c.position.z>10){
        scene.remove(c);
        coins.splice(i,1);
      }
    });

    obstacles.forEach((o,i)=>{
      o.lookAt(camera.position);
      o.position.z+=SPEED*delta;

      const closeZ=Math.abs(o.position.z-camera.position.z)<1;
      const sameLane=Math.abs(o.position.x-camera.position.x)<1;

      if(closeZ && sameLane){
        const type=o.userData.type;

        if(type==='jump' && (!isJumping || y<=1.6)) gameOver=true;
        if(type==='duck' && !isDucking) gameOver=true;
        if(type==='side') gameOver=true;

        scene.remove(o);
        obstacles.splice(i,1);
      }

      if(o.position.z>10){
        scene.remove(o);
        obstacles.splice(i,1);
      }
    });
  }

  renderer.render(scene,camera);
}

animate();