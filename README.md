# Voxen

PWA inicial do Voxen — uma plataforma de comunidades com feed público, grupos, canais de texto e salas de voz (a integração WebRTC vem numa etapa posterior).

## Tecnologias
- HTML, CSS e JavaScript sem build step.
- Supabase Auth + Postgres com Row Level Security (RLS).
- PWA com manifest e service worker.
- Hospedagem estática compatível com Vercel.

## Publicação na Vercel
- Framework Preset: **Other**
- Build Command: deixe vazio
- Output Directory: ponto (raiz do repositório)
- Install Command: deixe vazio

Depois de cada commit na branch conectada, a Vercel pode criar um novo deploy automaticamente.

## Supabase
O front-end usa a URL do projeto e uma **publishable key**, própria para uso público no navegador. Nunca adicione uma service_role ou sb_secret no repositório.

O schema SQL é aplicado diretamente no projeto Supabase Voxen e contém perfis, grupos, membros, canais de texto, salas de voz (metadados), mensagens, convites, publicações e curtidas, com RLS.

## Áudio e vídeo
Esta versão não captura, transmite, grava ou armazena áudio/vídeo. As salas de voz são apenas registros de metadados. A próxima etapa pode adicionar WebRTC com consentimento explícito do navegador; o sistema não deve salvar gravações.

## Limitações conhecidas
- Confirmação de e-mail pode ser necessária para entrar após o cadastro.
- Login, feed, grupos e mensagens dependem de internet e das políticas RLS do Supabase.
- O service worker mantém apenas o shell da interface em cache; não armazena mensagens offline.
- O suporte à instalação PWA e ao compartilhamento de tela varia conforme navegador e sistema operacional.
