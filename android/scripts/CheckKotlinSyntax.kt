import java.nio.file.Files
import java.nio.file.Path
import org.jetbrains.kotlin.cli.jvm.compiler.EnvironmentConfigFiles
import org.jetbrains.kotlin.cli.jvm.compiler.KotlinCoreEnvironment
import org.jetbrains.kotlin.config.CompilerConfiguration
import org.jetbrains.kotlin.com.intellij.openapi.util.Disposer
import org.jetbrains.kotlin.com.intellij.psi.PsiErrorElement
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil
import org.jetbrains.kotlin.psi.KtPsiFactory

object CheckKotlinSyntax {
    @JvmStatic fun main(args: Array<String>) {
        val disposable=Disposer.newDisposable()
        try {
            val env=KotlinCoreEnvironment.createForProduction(disposable,CompilerConfiguration(),EnvironmentConfigFiles.JVM_CONFIG_FILES)
            val factory=KtPsiFactory(env.project,false)
            var count=0
            var errors=0
            Files.walk(Path.of(args[0])).use { files ->
                files.filter { it.toString().endsWith(".kt") }.forEach { path ->
                    val text=Files.readString(path).removePrefix("\uFEFF").replace("\r\n","\n").replace('\r','\n')
                    val parsed=factory.createFile(path.fileName.toString(),text)
                    PsiTreeUtil.collectElementsOfType(parsed,PsiErrorElement::class.java).forEach { error ->
                        System.err.println("$path:${error.textOffset}: ${error.errorDescription}")
                        errors++
                    }
                    count++
                }
            }
            check(errors==0) { "$errors syntax errors" }
            println("Kotlin parser: $count source files passed (syntax only, not Android compilation)")
        } finally { Disposer.dispose(disposable) }
    }
}
