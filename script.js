import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160/build/three.module.js';

// ========================
const TRACK_LENGTH = 30;
const TRACK_COUNT = 10;

let SPEED = 18;
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
const bushTex = loader.load('./assets/textures/bush.png');

[groundTex, railTex].forEach(t => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
});

// ========================
// SCENE
// ========================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 20, 150);

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
// RENDERER (SHADOW ENABLED)
// ========================
const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('game'),
  antialias: true
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ========================
// LIGHTING 🌞
// ========================

// ambient
const ambient = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambient);

// hemisphere (sky light)
const hemi = new THREE.HemisphereLight(0x87ceeb, 0x444444, 0.6);
scene.add(hemi);

// sun
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(10, 20, 10);
sun.castShadow = true;

sun.shadow.mapSize.width = 1024;
sun.shadow.mapSize.height = 1024;

scene.add(sun);

// ========================
// PLAYER
// ========================
let lane = 0, y = 1.5, velocityY = 0;
let isJumping = false, isDucking = false;
let score = 0, gameOver = true;

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
  ground.receiveShadow = true;
  g.add(ground);

  railTex.repeat.set(1,10);

  [-2,0,2].forEach(x=>{
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.25,0.25,TRACK_LENGTH),
      new THREE.MeshStandardMaterial({ map: railTex })
    );
    rail.position.set(x,0.15,z);
    rail.castShadow = true;
    g.add(rail);
  });

  // walls
  [-6,6].forEach(x=>{
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(1.5,2.5,TRACK_LENGTH),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    wall.position.set(x,1.25,z);
    wall.castShadow = true;
    g.add(wall);
  });

  scene.add(g);
  return g;
}

for(let i=0;i<TRACK_COUNT;i++){
  track.push(createTrack(-i*TRACK_LENGTH));
}

// ========================
// ENVIRONMENT
// ========================
const environment = [];

function spawnBuilding(){
  const geo = new THREE.BoxGeometry(4, 6 + Math.random()*4, 4);
  const mat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });

  const b = new THREE.Mesh(geo, mat);

  const side = Math.random() < 0.5 ? -12 : 12;
  b.position.set(side, geo.parameters.height/2, -80);

  b.castShadow = true;

  scene.add(b);
  environment.push({ mesh:b, speed: SPEED * 0.4 });
}

function spawnPole(){
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1,0.1,3),
    new THREE.MeshStandardMaterial({ color: 0x333333 })
  );

  const side = Math.random() < 0.5 ? -5 : 5;
  pole.position.set(side,1.5,-60);

  pole.castShadow = true;

  scene.add(pole);
  environment.push({ mesh:pole, speed: SPEED * 0.7 });
}

function spawnBush(){
  const bush = new THREE.Mesh(
    new THREE.PlaneGeometry(3,3),
    new THREE.MeshBasicMaterial({ map:bushTex, transparent:true })
  );

  const side = Math.random() < 0.5 ? -7 : 7;
  bush.position.set(side,1.5,-60);

  scene.add(bush);
  environment.push({ mesh:bush, speed: SPEED });
}

// ========================
// DAY/NIGHT CYCLE 🌗
// ========================
let time = 0;

function updateDayNight(delta){
  time += delta * 0.05;

  const cycle = (Math.sin(time) + 1) / 2;

  // sky color
  scene.background = new THREE.Color().setHSL(0.6, 0.6, 0.4 + cycle * 0.3);

  // sun intensity
  sun.intensity = 0.5 + cycle * 1.2;

  // ambient
  ambient.intensity = 0.3 + cycle * 0.5;

  // move sun
  sun.position.set(
    Math.sin(time) * 20,
    20,
    Math.cos(time) * 20
  );
}

// ========================
// COINS + PARTICLES
// ========================
const coins = [];
const particles = [];

function spawnParticles(x,y,z){
  for(let i=0;i<6;i++){
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.05,6,6),
      new THREE.MeshBasicMaterial({
        color:0xffd700,
        transparent:true,
        opacity:1
      })
    );

    p.position.set(x,y,z);

    p.userData.velocity = {
      x:(Math.random()-0.5)*2,
      y:Math.random()*2,
      z:(Math.random()-0.5)*2
    };

    scene.add(p);
    particles.push(p);
  }
}

function spawnCoin(){
  const x = (LEVEL===1)?0:[-2,0,2][Math.random()*3|0];

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
let coinTimer=0, envTimer=0;

function animate(){
  requestAnimationFrame(animate);
  const delta=clock.getDelta();

  updateDayNight(delta);

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

    // ENV
    envTimer += delta;
    if(envTimer > 0.5){
      spawnBush();
      spawnPole();
      if(Math.random()<0.5) spawnBuilding();
      envTimer=0;
    }

    for(let i=environment.length-1;i>=0;i--){
      const e=environment[i];

      e.mesh.position.z+=e.speed*delta;

      if(e.mesh.position.z>10){
        scene.remove(e.mesh);
        environment.splice(i,1);
      }
    }

    // COINS
    coinTimer+=delta;
    if(coinTimer>0.6){
      spawnCoin();
      coinTimer=0;
    }

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

          spawnParticles(c.position.x,c.position.y,c.position.z);

          score+=10;
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

    // PARTICLES
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i];

      p.position.x+=p.userData.velocity.x*delta;
      p.position.y+=p.userData.velocity.y*delta;
      p.position.z+=p.userData.velocity.z*delta;

      p.material.opacity -= 2*delta;

      if(p.material.opacity<=0){
        scene.remove(p);
        particles.splice(i,1);
      }
    }
  }

  renderer.render(scene,camera);
}

animate();