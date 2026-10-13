import { jsxRenderer } from 'hono/jsx-renderer'

export const renderer = jsxRenderer(({ children }) => {
  return (
    <html lang="ko">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#f5f7fb" />
        <link rel="icon" href="data:," />
        <title>Q·INSIGHT | 공정 품질 관리</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Noto+Sans+KR:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link href="/static/style.css" rel="stylesheet" />
        <script src="/static/data-loader.js" defer></script>
        <script src="/static/admin-access.js" defer></script>
      </head>
      <body>
        {children}
        <dialog id="admin-access-dialog" class="admin-dialog" aria-labelledby="admin-dialog-title">
          <div class="admin-dialog-card">
            <button type="button" class="admin-dialog-close" data-admin-dialog-close aria-label="닫기">×</button>
            <p class="eyebrow">Q·INSIGHT ADMIN</p>
            <h2 id="admin-dialog-title">관리자 확인</h2>
            <p id="admin-dialog-description" class="admin-dialog-description">관리자 PIN을 입력해 주세요.</p>
            <form id="admin-access-form">
              <div id="admin-dialog-fields"></div>
              <p id="admin-dialog-status" class="admin-dialog-status" role="status" aria-live="polite"></p>
              <div class="admin-dialog-actions"><button type="submit" class="primary-button" id="admin-dialog-submit">확인</button></div>
            </form>
            <button type="button" class="admin-recovery-link" data-admin-forgot>복구 코드로 PIN 재설정</button>
          </div>
        </dialog>
      </body>
    </html>
  )
})
