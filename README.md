# Voxen

PWA do Voxen — comunidades com feed público, grupos, canais de texto, mensagens em tempo real e salas de voz WebRTC com microfone e compartilhamento de tela.

## Tecnologias
- HTML, CSS e JavaScript sem build step.
- Supabase Auth + Postgres com Row Level Security (RLS).
- PWA com manifest e service worker.
- WebRTC ponto a ponto para voz e compartilhamento de tela, com sinalização temporária pelo Supabase Realtime.
- Hospedagem estática compatível com Vercel.

## Publicação na Vercel
- Framework Preset: **Other**
- Build Command: deixe vazio
- Output Directory: ponto (raiz do repositório)
- Install Command: deixe vazio

Depois de cada commit na branch conectada, a Vercel pode criar um novo deploy automaticamente.

## Supabase
O front-end usa a URL do projeto e uma **publishable key**, própria para uso público no navegador. Nunca adicione uma service_role ou sb_secret no repositório.

O schema SQL é aplicado no projeto Supabase Voxen e contém perfis, grupos, membros, canais de texto, salas de voz (metadados), mensagens, convites, publicações e curtidas, com RLS. As correções incrementais também ficam em `supabase/migrations/`.

### Configuração de autenticação
No painel Supabase, abra **Authentication → URL Configuration** e configure:
- **Site URL** para o domínio de produção do Voxen na Vercel.
- **Redirect URLs** com o domínio de produção do Voxen e, se usar previews, `https://*.vercel.app/**` (ou adicione os domínios de preview explicitamente).

O app oferece cadastro com e-mail, senha e nome de jogador, login, recuperação de senha e edição do perfil. Se a confirmação de e-mail estiver ativa, o jogador precisa confirmar o e-mail antes de entrar.

## Áudio e vídeo
O app não grava nem armazena áudio ou vídeo. O áudio e a tela são transmitidos ao vivo via WebRTC; o navegador pede permissão para microfone e para cada compartilhamento de tela. O Supabase guarda apenas textos e metadados, e a sinalização da chamada é enviada por canais Realtime, não por tabelas de mídia. A conexão direta usa servidores STUN públicos; algumas redes restritivas podem exigir um servidor TURN para conectar.

## Limitações conhecidas
- Confirmação de e-mail pode ser necessária para entrar após o cadastro.
- Login, feed, grupos e mensagens dependem de internet e das políticas RLS do Supabase.
- O service worker mantém apenas o shell da interface em cache; não armazena mensagens offline.
- O suporte à instalação PWA e ao compartilhamento de tela varia conforme navegador e sistema operacional.
- WebRTC direto sem TURN não conecta em todas as combinações de rede/NAT; as salas podem precisar de um relay TURN para maior compatibilidade.
