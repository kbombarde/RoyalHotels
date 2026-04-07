import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160/build/three.module.js';

// ========================
const TRACK_LENGTH = 30;
const TRACK_COUNT = 10;

let SPEED = 20;
let LEVEL = 1;

// UI
const scoreEl = document.getElementById('score');
const menu = document.getElementById('menu');

// SOUND
const coinSound = new Audio('./assets/sounds/coin.mp3');
coinSound.volume = 0.4;

window.addEventListener('click', () => {
  coinSound.play().then(()=>coinSound.pause()).catch(()=>{});
}, { once: true });

// ========================
// TEXTURES
// ========================
const loader = new THREE.TextureLoader();

const groundTex = loader.load('./assets/textures/ground.png');
const railTex = loader.load('./assets/textures/rail.png');
const coinTex = loader.load('./assets/textures/coin.png');

[groundTex, railTex].forEach(t => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
});

// ========================
// SCENE
// ========================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 10, 120);

// ========================
// CAMERA
// ========================
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth/window.innerHeight,
  0.1,
  1000
);

// ========================
// RENDERER
// ========================
const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('game'),
  antialias: true
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

// ========================
// LIGHT
// ========================
scene.add(new THREE.AmbientLight(0xffffff, 0.8));

const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(10,20,10);
scene.add(sun);

// ========================
// PLAYER STATE
// ========================
let lane = 0;
let y = 1.5;
let velocityY = 0;

let isJumping = false;
let isDucking = false;

let score = 0;
let gameOver = true;

// ========================
// CAMERA EFFECTS
// ========================
let bobTime = 0;

// ========================
// TRACK
// ========================
const track = [];

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

  // walls
  [-6,6].forEach(x=>{
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(1.5,2.5,TRACK_LENGTH),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    wall.position.set(x,1.25,z);
    g.add(wall);
  });

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
  const x = 0; // level 1 center

  const c = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8,0.8),
    new THREE.MeshBasicMaterial({ map:coinTex, transparent:true })
  );

  c.position.set(x,1.5,-60);
  c.userData.collected=false;
  c.userData.scale=1;

  scene.add(c);
  coins.push(c);
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
function resetGame(){
  score=0;
  gameOver=false;
}

// ========================
window.startGame = () => {
  LEVEL = parseInt(document.getElementById('level').value);
  menu.style.display = 'none';
  resetGame();
};

// ========================
// LOOP
// ========================
const clock=new THREE.Clock();
let coinTimer=0;

function animate(){
  requestAnimationFrame(animate);
  const delta=clock.getDelta();

  if(!gameOver){

    // ========================
    // PHYSICS
    // ========================
    velocityY -= 20 * delta;
    y += velocityY * delta;

    if(y<=1.5){
      y=1.5;
      velocityY=0;
      isJumping=false;
    }

    // ========================
    // CAMERA REAL FEEL 🔥
    // ========================
    bobTime += delta * 10;

    const bob = Math.sin(bobTime) * 0.1;

    const targetX = lane * 2;

    camera.position.x += (targetX - camera.position.x) * 0.2;
    camera.position.y = (isDucking ? 1 : y) + bob;
    camera.position.z = 5;

    // LOOK slightly down forward
    camera.lookAt(
      camera.position.x,
      camera.position.y - 0.2,
      -20
    );

    // slight tilt
    camera.rotation.z = -lane * 0.05;

    // ========================
    // MOVE WORLD
    // ========================
    let farthestZ = Infinity;

    for(const t of track){
      t.position.z += SPEED * delta;
      if(t.position.z < farthestZ) farthestZ = t.position.z;
    }

    for(const t of track){
      if(t.position.z > TRACK_LENGTH){
        t.position.z = farthestZ - TRACK_LENGTH;
      }
    }

    // ========================
    // SPAWN COINS
    // ========================
    coinTimer += delta;
    if(coinTimer > 0.6){
      spawnCoin();
      coinTimer = 0;
    }

    // ========================
    // COINS
    // ========================
    for(let i=coins.length-1;i>=0;i--){
      const c=coins[i];

      c.lookAt(camera.position);
      c.position.z+=SPEED*delta;

      if(!c.userData.collected){
        const hit =
          Math.abs(c.position.z-camera.position.z)<1 &&
          Math.abs(c.position.x-camera.position.x)<1;

        if(hit){
          c.userData.collected=true;

          coinSound.currentTime=0;
          coinSound.play().catch(()=>{});

          score+=10;
          scoreEl.innerText=score;
        }
      }

      if(c.userData.collected){
        c.userData.scale+=0.12;
        c.scale.set(c.userData.scale,c.userData.scale,1);
        c.position.y+=1.5*delta;

        if(c.userData.scale>2){
          scene.remove(c);
          coins.splice(i,1);
        }
      }

      if(c.position.z>10){
        scene.remove(c);
        coins.splice(i,1);
      }
    }
  }

  renderer.render(scene,camera);
}

animate();