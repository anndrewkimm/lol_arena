const fs = require('fs');
const https = require('https');
const path = require('path');

// Put your full list of augment names here (from your message)
const augmentNames = [
  'acceleratingsorcery', 'adapt', 'allforyou', 'andmyaxe', 'apexinventor',
  'augment404', 'augment405', 'backtobasics', 'bannerofcommand', 'bigbrain',
  'bladewaltz', 'bloodbrother', 'bluntforce', 'breadandbutter', 'breadandcheese',
  'breadandjam', 'buckleup', 'buffbuddies', 'bulletheaven', 'cannonfodder',
  'canttouchthis', 'castle', 'celestialbody', 'centeroftheuniverse', 'chainlightning',
  'chauffeur', 'circleofdeath', 'clothesline', 'clowncollege', 'combomaster',
  'contractkiller', 'courageofthecolossus', 'criticalhealing', 'darkblessing', 'dashing',
  'dawnbringersresolve', 'deathtouch', 'defensivemaneuvers', 'deft', 'dematerialize',
  'demonsdance', 'desecrator', 'dieanotherday', 'divebomber', 'dontblink',
  'dontchase', 'doomsayer', 'drawyoursword', 'dualwield', 'earthwake',
  'erosion', 'escapade', 'etherealweapon', 'eureka', 'evocation',
  'executioner', 'extendoarm', 'fallenaegis', 'fanthehammer', 'feeltheburn',
  'feymagic', 'firebrand', 'firesale', 'firfox', 'firstaidkit',
  'flashbang', 'flashy', 'frombeginningtoend', 'frostwraith', 'frozenfoundations',
  'fruitarian', 'fullyautomated', 'giantslayer', 'gohsacrificefor', 'gohsacrificeforgold',
  'gohsacrificeforprismatic', 'goliath', 'goredrink', 'guiltypleasure', 'hattrick',
  'heavyhitter', 'holdverystill', 'holyfire', 'homeguard', 'icecold',
  'impassable', 'infernalconduit', 'infernalsoul', 'itscritical', 'itskillingtime',
  'jeweledgauntlet', 'juicebox', 'juicepress', 'keystoneconjurer', 'lasereyes',
  'legday', 'lightemup', 'lightningstrikes', 'lightwarden', 'madscientist',
  'magicmissile', 'marksmage', 'masterofduality', 'midnightexpress', 'mindtomatter',
  'minionmancer', 'mirrorimage', 'mountainsoul', 'mysticpunch', 'mythical',
  'nestingdoll', 'nowyouseeme', 'numbtopain', 'oathsworn', 'oceansoul',
  'okboomerang', 'omnisoul', 'orbitallaser', 'outlawsgrit', 'overflow',
  'parasiticmutation', 'parasiticrelationship', 'perseverance', 'phenomenalevil', 'plaguebearer',
  'quantumcomputing', 'quest_angelofretribution', 'quest_prismaticegg', 'quest_steelyourheart', 'quest_urfschampion',
  'quest_woogletswitchcap', 'rabblerousing', 'raidboss', 'recursion', 'repulsor',
  'restart', 'restlessrestoration', 'scopedweapons', 'scopierweapons', 'scopiestweapons',
  'searingdawn', 'selfdestruct', 'servebeyonddeath', 'shadowrunner', 'shrinkray',
  'skilledsniper', 'slaparound', 'slimetime', 'slowactingpainkillers', 'slowandsteady',
  'slowcooker', 'snowballfight', 'sonicboom', 'soulsiphon', 'spellwake',
  'spintowin', 'spiritlink', 'stackosaurusrex', 'stats', 'statsonstats',
  'statsonstatsonstats', 'summonerrevolution', 'summonersroulette', 'symbioticmutation', 'symphonyofwar',
  'tankengine', 'tankitorleaveit', 'tapdancer'
];

const downloadDir = path.join(__dirname, 'public', 'augments');
if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

function downloadImage(name) {
  return new Promise((resolve, reject) => {
    const url = `https://raw.communitydragon.org/latest/game/assets/ux/cherry/augments/icons/${name}_large.png`;
    const filePath = path.join(downloadDir, `${name}_large.png`);

    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(`Failed to download ${url} - Status code: ${res.statusCode}`);
        return;
      }

      const fileStream = fs.createWriteStream(filePath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        console.log(`Downloaded ${filePath}`);
        resolve();
      });
    }).on('error', (err) => reject(err));
  });
}

async function downloadAll() {
  for (const name of augmentNames) {
    try {
      await downloadImage(name);
    } catch (error) {
      console.error(error);
    }
  }
  console.log('All downloads complete!');
}

downloadAll();
