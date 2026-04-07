import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160/build/three.module.js';

// ========================
const TRACK_LENGTH = 30;
const TRACK_COUNT = 10;

let SPEED = 18;
let LEVEL = 1;

// UI
const scoreEl = document.getElementById('score');
const menu = document.getElementById('menu');

window.startGame = () => {
  LEVEL = parseInt(document.getElementById('level').value);
  menu.style.display = 'none';
  resetGame();
};

// ========================
// TEXTURES
// ========================
const loader = new THREE.TextureLoader();

const groundTex = loader.load('./assets/textures/ground.png');
const railTex = loader.load('./assets/textures/rail.png');
const coinTex = loader.load('./assets/textures/coin.png');
const bushTex = loader.load('./assets/textures/bush.png');
const barricadeTex = loader.load('./assets/textures/barricade.png');
const barrelTex = loader.load('./assets/textures/barrel.png');
const barTex = loader.load('./assets/textures/bar.png');

[groundTex, railTex].forEach(t => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
});

// ========================
// SCENE
// ========================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 20, 100);

// SKY
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(200, 32, 32),
  new THREE.MeshBasicMaterial({ color: 0x87ceeb, side: THREE.BackSide })
);
scene.add(sky);

// CAMERA
const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);

// RENDERER
const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('game'),
  antialias: true
});
renderer.setSize(window.innerWidth, window.innerHeight);

// LIGHT
scene.add(new THREE.AmbientLight(0xffffff, 0.9));

// ========================
// PLAYER
// ========================
let lane = 0, y = 1.5, velocityY = 0;
let isJumping = false, isDucking = false;
let score = 0, gameOver = true;

// ========================
// TRACK + PROPS
// ========================
const track = [];

function addSideProps(group, z){
  for(let i=0;i<TRACK_LENGTH;i+=6){
    const left = new THREE.Mesh(
      new THREE.PlaneGeometry(3,3),
      new THREE.MeshBasicMaterial({ map:bushTex, transparent:true })
    );
    left.position.set(-7,1.5,z-i);
    group.add(left);

    const right = left.clone();
    right.position.x = 7;
    group.add(right);
  }
}

function createTrack(z){
  const g = new THREE.Group();

  groundTex.repeat.set(4,10);

  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(12,0.2,TRACK_LENGTH),
    new THREE.MeshStandardMaterial({ map: groundTex })
  );
  ground.position.set(0,0,z);
  g.add(ground);

  railTex.repeat.set(1,10);

  [-2,0,2].forEach(x=>{
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.25,0.25,TRACK_LENGTH),
      new THREE.MeshStandardMaterial({ map: railTex })
    );
    rail.position.set(x,0.15,z);
    g.add(rail);
  });

  [-6,6].forEach(x=>{
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(1,1,TRACK_LENGTH),
      new THREE.MeshStandardMaterial({ color: 0xff5533 })
    );
    wall.position.set(x,0.5,z);
    g.add(wall);
  });

  addSideProps(g,z);
  scene.add(g);
  return g;
}

for(let i=0;i<TRACK_COUNT;i++){
  track.push(createTrack(-i*TRACK_LENGTH));
}

// ========================
// COINS
// ========================
const coins = [];

function spawnCoin(){
  const x = [-2,0,2][Math.random()*3|0];

  const c = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8,0.8),
    new THREE.MeshBasicMaterial({ map:coinTex, transparent:true })
  );

  c.position.set(x,1.5,-60);
  scene.add(c);
  coins.push(c);
}

// ========================
// OBSTACLES (FINAL)
// ========================
const obstacles = [];

function spawnObstacle(){

  if(LEVEL === 1) return;

  // LEVEL 2 → FORCE JUMP
  if(LEVEL === 2){
    [-2,0,2].forEach(x=>{
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(2,1.5),
        new THREE.MeshBasicMaterial({ map:barricadeTex, transparent:true })
      );
      mesh.position.set(x,1,-60);
      mesh.userData.type='jump';

      scene.add(mesh);
      obstacles.push(mesh);
    });
    return;
  }

  // LEVEL 3 → DUCK + OCCASIONAL JUMP
  if(LEVEL === 3){

    if(Math.random() < 0.7){
      // full duck
      [-2,0,2].forEach(x=>{
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(2.5,1),
          new THREE.MeshBasicMaterial({ map:barTex, transparent:true })
        );
        mesh.position.set(x,2,-60);
        mesh.userData.type='duck';

        scene.add(mesh);
        obstacles.push(mesh);
      });

    } else {
      // jump only center
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(2,1.5),
        new THREE.MeshBasicMaterial({ map:barricadeTex, transparent:true })
      );

      mesh.position.set(0,1,-60);
      mesh.userData.type='jump';

      scene.add(mesh);
      obstacles.push(mesh);
    }

    return;
  }

  // OTHER LEVELS
  let type = ['jump','duck','side'][Math.random()*3|0];
  const x = [-2,0,2][Math.random()*3|0];

  let mesh;

  if(type==='jump'){
    mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2,1.5),
      new THREE.MeshBasicMaterial({ map:barricadeTex, transparent:true })
    );
    mesh.position.set(x,1,-60);
  }

  if(type==='duck'){
    mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5,1),
      new THREE.MeshBasicMaterial({ map:barTex, transparent:true })
    );
    mesh.position.set(x,2,-60);
  }

  if(type==='side'){
    mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2,1.2),
      new THREE.MeshBasicMaterial({ map:barrelTex, transparent:true })
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
window.addEventListener('keydown', e=>{
  if(gameOver) return;

  if(e.key==='ArrowLeft') lane=Math.max(-1,lane-1);
  if(e.key==='ArrowRight') lane=Math.min(1,lane+1);

  if(e.key==='ArrowUp'&&!isJumping){
    velocityY=8;
    isJumping=true;
  }

  if(e.key==='ArrowDown'){
    isDucking=true;
    setTimeout(()=>isDucking=false,400);
  }
});

// ========================
// RESET
// ========================
function resetGame(){
  score=0;
  gameOver=false;

  SPEED=18;
}

// ========================
// LOOP
// ========================
const clock=new THREE.Clock();
let spawnTimer=0,coinTimer=0;

function animate(){
  requestAnimationFrame(animate);
  const delta=clock.getDelta();

  if(!gameOver){

    score+=Math.floor(delta*100);
    scoreEl.innerText=score;

    velocityY-=20*delta;
    y+=velocityY*delta;

    if(y<=1.5){
      y=1.5;
      velocityY=0;
      isJumping=false;
    }

    const targetX=lane*2;

    camera.position.x+=(targetX-camera.position.x)*0.2;
    camera.position.y=isDucking?1:y;
    camera.position.z=5;

    camera.lookAt(camera.position.x,camera.position.y,-25);

    let farthestZ=Infinity;

    for(const t of track){
      t.position.z+=SPEED*delta;
      if(t.position.z<farthestZ) farthestZ=t.position.z;
    }

    for(const t of track){
      if(t.position.z>TRACK_LENGTH){
        t.position.z=farthestZ-TRACK_LENGTH;
      }
    }

    spawnTimer+=delta;
    if(spawnTimer>1){
      spawnObstacle();
      spawnTimer=0;
    }

    coinTimer+=delta;
    if(coinTimer>0.6){
      spawnCoin();
      coinTimer=0;
    }

    // obstacles
    for(let i=obstacles.length-1;i>=0;i--){
      const o=obstacles[i];

      o.lookAt(camera.position);
      o.position.z+=SPEED*delta;

      const hit =
        Math.abs(o.position.z-camera.position.z)<1 &&
        Math.abs(o.position.x-camera.position.x)<1;

      if(hit){
        const t=o.userData.type;

        if(t==='jump'&&(!isJumping||y<=1.6)) endGame();
        if(t==='duck'&&!isDucking) endGame();
        if(t==='side') endGame();
      }

      if(o.position.z>10){
        scene.remove(o);
        obstacles.splice(i,1);
      }
    }

    // coins
    for(let i=coins.length-1;i>=0;i--){
      const c=coins[i];

      c.lookAt(camera.position);
      c.position.z+=SPEED*delta;

      const collected =
        Math.abs(c.position.z-camera.position.z)<1 &&
        Math.abs(c.position.x-camera.position.x)<1;

      if(collected){
        scene.remove(c);
        coins.splice(i,1);
        score+=10;
      }

      if(c.position.z>10){
        scene.remove(c);
        coins.splice(i,1);
      }
    }
  }

  renderer.render(scene,camera);
}

function endGame(){
  gameOver=true;
  menu.style.display='block';
}

animate();