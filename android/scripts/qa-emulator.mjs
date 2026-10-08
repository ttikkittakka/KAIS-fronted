import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const serial=process.argv[2];
if(!serial?.startsWith('emulator-')) throw Error('Pass a running emulator serial explicitly: node scripts/qa-emulator.mjs emulator-5554');
const adb=process.env.ADB||'adb';
function run(args) {
    const result=spawnSync(adb,['-s',serial,...args],{encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
    if(result.error) throw result.error;
    if(result.status!==0) throw Error(result.stderr||result.stdout);
    return result.stdout;
}
const app=join(root,'app/build/outputs/apk/debug/app-debug.apk');
const tests=join(root,'app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk');
if(!existsSync(app)||!existsSync(tests)) throw Error('First build :app:assembleDebug :app:assembleDebugAndroidTest.');
const originalSize=run(['shell','wm','size']).match(/Override size: (\d+x\d+)/)?.[1];
const originalDensity=run(['shell','wm','density']).match(/Override density: (\d+)/)?.[1];
const output=join(root,'build/device-qa'); mkdirSync(output,{recursive:true});
try {
    run(['install','-r',app]); run(['install','-r',tests]);
    for(const [width,height] of [[360,800],[390,844],[412,915]]) {
        run(['shell','wm','density','320']);
        run(['shell','wm','size',`${width*2}x${height*2}`]);
        const folder=join(output,`${width}x${height}`); mkdirSync(folder,{recursive:true});
        const result=run(['shell','am','instrument','-w','com.littlegarden.app.test/com.littlegarden.app.GardenTestRunner']);
        writeFileSync(join(folder,'instrumentation.txt'),result);
        if(!/OK \(\d+ tests?\)/.test(result)||/FAILURES!!!/.test(result)) throw Error(`Instrumentation failed at ${width}x${height}; see log.`);
        run(['pull','/sdcard/Android/data/com.littlegarden.app/files/qa',folder]);
        console.log(`PASS ${width}x${height}; screenshots: ${folder}`);
    }
} finally {
    run(['shell','wm','size',originalSize||'reset']);
    run(['shell','wm','density',originalDensity||'reset']);
}

