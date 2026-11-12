# Verba Codex CLI 테스트판

- 포크 버전 `0.6.143-cli.1`
- 변경일 2026-11-12
- 원본 [foreverharibo-boop/verba](https://github.com/foreverharibo-boop/verba), 커밋 `22eedbe`
- 라이선스 AGPL-3.0-only. 원작자 및 출처는 [NOTICE](NOTICE)를 참고하세요.

## 설치

1. SillyTavern을 실행하는 환경에 최신 Codex CLI를 설치하고, 서버를 실행하는 계정으로 `codex login`을 완료합니다. WSL이나 Docker에서 SillyTavern을 실행한다면 그 환경에서 Codex CLI가 실행되어야 합니다.
2. SillyTavern을 종료합니다. 기존 베르바 확장 폴더와 Verba 서버 플러그인을 백업하려면 SillyTavern이 확장과 플러그인을 읽는 디렉터리 밖으로 옮깁니다.
3. ZIP의 `verba_cli` 폴더를 SillyTavern의 `data/default-user/extensions/`에 복사합니다. 다른 사용자 계정이나 데이터 경로를 쓰면 해당 계정의 `extensions/`에 복사합니다.
4. ZIP의 `verba_cli/server-plugin` 폴더를 SillyTavern의 `plugins/verba-server`로 복사합니다. 최종 위치는 `plugins/verba-server/index.cjs`입니다. 기존 Verba 서버 플러그인과 이 서버 플러그인은 같은 ID를 사용하므로 한 사본만 로드되도록 설치합니다.
5. SillyTavern의 `config.yaml`에 있는 `enableServerPlugins` 값을 `true`로 설정하고 재시작합니다.

ZIP은 수동 설치에 사용할 수 있습니다. Git으로 설치하려면 이 포크의 `install-server.sh`를 사용하세요. SillyTavern에서 CLI를 찾지 못하면 서버 환경 변수 `VERBA_CODEX_EXECUTABLE`에 Codex 실행 파일의 절대 경로를 지정할 수 있습니다. Windows에서는 `codex.exe`를 지정하세요.

## 연결 테스트

1. **베르바 설정 → 번역 엔진·연결 프로필 → Codex CLI 사용**을 체크합니다.
2. Codex가 제공하는 **GPT 모델**과 **리즈닝 강도**를 선택합니다.
3. **현재 AI 연결 테스트**를 누릅니다. 연결 성공 메시지에 테스트 번역문이 표시됩니다.
4. 평소 쓰는 메시지에서 기존 번역 버튼으로 확인합니다. CLI 체크를 끄면 원래 선택한 번역 엔진과 연결 프로필을 다시 사용합니다.

CLI 요청은 실리태번 서버에서 실행됩니다. 이 포크의 연결 기능은 베르바의 브라우저 번역과 선택형 서버 번역 양쪽에서 사용할 수 있습니다.
