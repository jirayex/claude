# 🤖 Atendente de IA para WhatsApp Business (grátis)

Uma atendente virtual que conversa como gente no seu WhatsApp Business, 24h por dia, usando a **API oficial da Meta**. O cérebro é o **Claude (Anthropic)**, com IAs gratuitas como reserva automática.

## O que ela faz

| Recurso | Como funciona |
|---|---|
| **Conversa humanizada** | Responde em balões curtos, com "digitando..." e pausas proporcionais ao tamanho do texto. Espelha o tom do cliente, usa o nome dele e diz "bom dia" ou "boa noite" conforme o horário. |
| **Espera o cliente terminar** | Quando o cliente manda 3 mensagens seguidas, ela espera e responde tudo de uma vez, como uma pessoa faria. |
| **Memória por cliente** | Lembra o histórico, o nome e anotações (interesse, orçamento, cidade...) de cada contato. |
| **Entende áudio** | Transcreve áudios com o Whisper (grátis na Groq). |
| **Entende mídia** | Fotos, vídeos, documentos, localização e figurinhas são reconhecidos e comentados. |
| **Base de conhecimento** | Lê os arquivos da pasta `knowledge/` (preços, horários, FAQ). Edite e vale na hora, sem reiniciar. |
| **Não inventa** | Quando não sabe, diz que vai confirmar e chama um humano. |
| **Transferência para humano** | Se o cliente pede atendente, reclama ou quer fechar negócio, a IA pausa e manda um aviso no **seu** WhatsApp com o resumo e o link do cliente. |
| **Controle pelo seu celular** | Você manda `#pausar 5511...` ou `#retomar 5511...` para assumir ou devolver a conversa. |
| **Cérebro Claude** | Usa o Claude como IA principal. A persona e a base de conhecimento ficam em cache, o que barateia as mensagens seguintes. |
| **Nunca fica fora do ar** | Se o Claude falhar (sem crédito, fora do ar), troca sozinha para as IAs grátis (Claude → Groq → Gemini → Ollama). |
| **Segurança** | Valida a assinatura da Meta em toda requisição do webhook. |

Precisa só do **Node.js 20+**. A única dependência é o SDK oficial da Anthropic.

---

## 💰 Quanto custa? (resposta honesta)

| Parte | Custo |
|---|---|
| Este código | Grátis. |
| **Claude (cérebro principal)** | **Pago por uso**, com créditos pré-pagos em console.anthropic.com. A assinatura Claude Pro/Max **não** cobre a API. Estimativa com o modelo padrão (`claude-opus-5-5`, effort `low`): em torno de **US$ 0,01 a 0,03 por resposta**. Confira o gasto real no painel, porque varia com o tamanho da base de conhecimento e da conversa. Para gastar bem menos, use `CLAUDE_MODEL=claude-haiku-4-5` (mais simples e barato) ou `claude-sonnet-5-5` (meio-termo). Defina um limite de gasto mensal no console. |
| Reservas (Groq / Gemini) | Grátis dentro dos limites diários. O **Ollama** no seu computador é grátis e ilimitado. Se quiser custo zero, tire `claude` de `LLM_PROVIDERS`. |
| WhatsApp Cloud API (Meta) | **Responder clientes que mandaram mensagem é grátis** (dentro da janela de 24h após a última mensagem do cliente). Você **paga** só se quiser *iniciar* conversas com mensagens de marketing (modelos/templates). Um bot de atendimento não precisa disso. |
| Servidor | Grátis com as opções abaixo. |

> ⚠️ **Por que não usar uma "API não oficial" (QR Code / WhatsApp Web)?** Elas são grátis, mas violam os termos do WhatsApp, e **o seu número pode ser banido**. Para um número de empresa, o risco não compensa. Este projeto usa só a API oficial.

> ℹ️ A Meta muda a política de preços de tempos em tempos. Confira a tabela atual em developers.facebook.com/docs/whatsapp/pricing antes de lançar.

---

## 🚀 Passo a passo

### 1. Testar a IA no seu computador (5 minutos)

```bash
npm install
cp .env.example .env
# 1. Crie a chave do Claude em https://console.anthropic.com (Settings → API Keys),
#    coloque créditos e cole em ANTHROPIC_API_KEY
# 2. (Recomendado) Crie uma chave grátis em https://console.groq.com/keys e cole em GROQ_API_KEY.
#    Ela serve de reserva e é usada para transcrever áudios.
npm run chat
```

Converse no terminal. Ajuste `prompts/persona.md` (personalidade) e `knowledge/empresa.md` (dados da empresa) até ficar do seu jeito.

### 2. Criar o app do WhatsApp na Meta

1. Acesse **developers.facebook.com** → *Meus apps* → *Criar app* → tipo **Empresa** → adicione o produto **WhatsApp**.
2. Em **WhatsApp → Configuração da API**, copie:
   - o **ID do número de telefone** → `WHATSAPP_PHONE_NUMBER_ID`
   - o **token** → `WHATSAPP_TOKEN`. O token temporário expira em 24h. Para produção, crie um **token permanente**: Configurações do Negócio → Usuários do sistema → Gerar token, com as permissões `whatsapp_business_messaging` e `whatsapp_business_management`.
3. Em **Configurações do app → Básico**, copie a **Chave secreta do app** → `WHATSAPP_APP_SECRET`.
4. Invente uma senha qualquer → `WHATSAPP_VERIFY_TOKEN`.
5. Para usar o **seu número real**: em *Configuração da API → Adicionar número de telefone*.
   ⚠️ Um número só pode estar **ou** no app WhatsApp Business do celular **ou** na API. Se o seu número já está no app, a Meta oferece a "coexistência" em alguns casos. Se não for possível, use um chip novo só para o bot.

### 3. Colocar no ar (grátis)

Escolha uma opção:

**Opção A: no seu próprio computador + Cloudflare Tunnel** (o mais simples, mas o PC precisa ficar ligado)
```bash
npm start
# em outro terminal (instale o cloudflared antes):
cloudflared tunnel --url http://localhost:3000
# ele mostra uma URL https://xxxx.trycloudflare.com
```

**Opção B: Oracle Cloud "Always Free"** (servidor grátis para sempre, ligado 24h; é a opção recomendada)
Crie uma VM grátis, instale o Node, clone este repositório, rode `npm start` com `pm2` ou `systemd`, e use o Cloudflare Tunnel ou o IP público com HTTPS.

**Opção C: Render / Koyeb (plano grátis)**
Funciona, mas o servidor "dorme" sem uso: a primeira resposta pode demorar uns 30 a 50s. Além disso, o disco é apagado a cada deploy, então a memória dos clientes se perde.

### 4. Ligar o webhook

No painel da Meta → **WhatsApp → Configuração**:
- **URL de callback**: `https://SUA-URL/webhook`
- **Token de verificação**: o mesmo `WHATSAPP_VERIFY_TOKEN`
- Clique em **Verificar e salvar**, depois em **Gerenciar** e assine o campo **messages**.

Pronto: mande um "oi" para o número e veja a mágica. ✨

---

## ⚙️ Personalizar

- **Personalidade / regras**: `prompts/persona.md`
- **Informações do negócio**: qualquer `.md` ou `.txt` dentro de `knowledge/`
- **Nome da atendente, empresa, horário, velocidade**: `.env`
- **Quem recebe os avisos de transferência**: `OWNER_NUMBERS` (pode ser mais de um, separados por vírgula)

### Comandos do dono (mandar do número em `OWNER_NUMBERS`)
- `#pausar 5511999999999`: a IA para de responder esse cliente e você assume
- `#retomar 5511999999999`: a IA volta a atender

## 🧪 Testes
```bash
npm test
```

## Estrutura
```
src/server.js     webhook da Meta (recebe e valida mensagens)
src/agent.js      cérebro: memória, prompt, transferência para humano, comandos
src/humanizer.js  balões, tempo de digitação, horário comercial
src/llm.js        Claude (principal) + IAs grátis de reserva + transcrição de áudio
src/whatsapp.js   envio de mensagens, "digitando...", download de mídia
src/memory.js     memória dos clientes (arquivo data/memory.json)
src/cli.js        conversar com a IA pelo terminal
```

## Próximos passos possíveis
- O Claude enxergar as fotos que o cliente manda (produto, comprovante, documento)
- Agendamento automático no Google Agenda
- Envio de catálogo, botões e listas interativas
- Painel web para ver as conversas
- Follow-up automático de leads que pararam de responder (exige templates pagos da Meta fora da janela de 24h)
