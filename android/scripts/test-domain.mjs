import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const cache=process.env.GRADLE_DEPENDENCY_CACHE||join(homedir(),'.gradle/caches/modules-2/files-2.1');
const groups=['org.jetbrains.kotlin/kotlin-compiler-embeddable/2.3.10','org.jetbrains.kotlin/kotlin-stdlib/2.3.10','org.jetbrains.kotlin/kotlin-script-runtime/2.3.10','org.jetbrains.kotlin/kotlin-reflect','org.jetbrains/annotations','org.jetbrains.kotlinx/kotlinx-coroutines-core-jvm/1.8.0','org.jetbrains.intellij.deps/trove4j'];
function jars(p) { return existsSync(p)?readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?jars(join(p,e.name)):e.name.endsWith('.jar')?[join(p,e.name)]:[]):[]; }
const cp=groups.flatMap(g=>jars(join(cache,g))).join(delimiter);
if(!cp.includes('kotlin-compiler-embeddable')) throw Error('Kotlin 2.3.10 not cached. Use gradlew :app:testDebugUnitTest.');
const out=join(root,'build/domain-checks'); mkdirSync(out,{recursive:true});
function run(args) { const r=spawnSync('java',args,{stdio:'inherit',timeout:120000}); if(r.error) throw r.error; if(r.status!==0) process.exit(r.status||1); }
run(['-cp',cp,'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','-no-stdlib','-no-reflect','-classpath',cp,'-jvm-target','17','-d',out,join(root,'app/src/main/java/com/littlegarden/app/data/model/GardenModels.kt'),join(root,'app/src/test/java/com/littlegarden/app/DomainChecks.kt'),join(root,'app/src/main/java/com/littlegarden/app/navigation/GardenFlow.kt'),join(root,'scripts/CheckKotlinSyntax.kt')]);
run(['-cp',out+delimiter+cp,'com.littlegarden.app.DomainChecks']);

run(['-cp',out+delimiter+cp,'CheckKotlinSyntax',join(root,'app/src')]);


