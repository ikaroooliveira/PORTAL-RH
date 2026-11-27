# Portal RTC – frontend da Calculadora da Reforma Tributária

HTML/CSS/JS puro (módulos ES), visual do Portal RH. O backend Java original não é alterado.

## Executar
1. Suba o backend (na pasta do projeto Java): `./mvnw spring-boot:run` (porta 8080, contexto `/api`).
2. Nesta pasta: `node server.js` (variáveis opcionais: `BACKEND=http://localhost:8080 PORT=3000`).
3. Abra http://localhost:3000

O `server.js` serve o frontend e repassa `/api/*` ao backend (evita CORS). A URL da API fica em `js/config.js`
e pode ser trocada pelo botão **API** da barra lateral.

## Telas
Cálculo IBS/CBS/IS (`/regime-geral`), base tributária (`/base-calculo/*`), CST/cClassTrib, NCM/NBS,
alíquotas e fundamentações (`/dados-abertos/*`), geração/validação de XML (`/xml/*`).
Nenhuma fórmula ou alíquota é calculada no navegador.
