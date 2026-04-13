@echo off
echo.
echo =======================================================
echo     CacheSnap - Reset Total do Banco de Dados
echo =======================================================
echo.
echo Aviso: Isso apagará TODOS os dados, usuarios, monitores e probes!
echo.

set /p confirm="Tem certeza que deseja apagar os dados? (S/N): "
if /i "%confirm%" neq "s" (
    echo.
    echo Operacao cancelada.
    pause
    exit /b
)

:: Muda o diretorio para a pasta da api para que o cargo sqlx encontre o arquivo .env e migrations
cd /d "%~dp0..\api"

echo.
echo [1/3] Deletando banco de dados atual...
cargo sqlx database drop -y

echo.
echo [2/3] Criando um novo banco de dados vazio...
cargo sqlx database create

echo.
echo [3/3] Aplicando todas as migrações (incluindo as de auditoria)...
cargo sqlx migrate run --source ../migrations

echo.
echo =======================================================
echo Banco de dados zerado e pronto para uso!
echo =======================================================
echo.
echo Ao terminar, certifique-se de parar a API antiga e rolar novamente com 'cargo run' na pasta api.
echo.
pause
