/* Voxen frontend. Only the publishable Supabase key belongs in browser code. */
const SUPABASE_URL = "https://kldphrwrdpdbeidgvqfl.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_JQbVo4uU_fykam905ziYbA_cFcKpIar";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = (selector) => document.querySelector(selector);
const state = { user: null, profile: null, groups: [], selectedGroup: null, channels: [], voiceRooms: [], currentMemberRole: null, selectedChannel: null, authMode: "login", messageSubscription: null, feedSubscription: null, voice: null, groupPresence: null, onlineUserIds: new Set() };
let toastTimer;
function toast(message) {
  const node = $("#toast"); node.textContent = message; node.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove("show"), 3200);
}
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
function initials(value = "V") { return String(value).trim().slice(0, 1).toUpperCase() || "V"; }
function formatDate(value) { return new Intl.DateTimeFormat("pt-BR", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" }).format(new Date(value)); }
function setAuthMode(mode) {
  state.authMode = mode; const signup = mode === "signup";
  $("#show-login").classList.toggle("selected", !signup); $("#show-signup").classList.toggle("selected", signup);
  $("#username-field").hidden = !signup; $("#auth-username").required = signup;
  $("#auth-password").autocomplete = signup ? "new-password" : "current-password";
  $("#auth-title").textContent = signup ? "Seu lugar começa aqui." : "Que bom ter você de volta.";
  $("#auth-subtitle").textContent = signup ? "Crie sua conta e encontre sua comunidade." : "Entre para continuar de onde parou.";
  $("#auth-submit").innerHTML = signup ? 'Criar minha conta <span>→</span>' : 'Entrar no Voxen <span>→</span>';
  $("#auth-message").textContent = "";
}
$("#show-login").addEventListener("click", () => setAuthMode("login"));
$("#show-signup").addEventListener("click", () => setAuthMode("signup"));
$("#auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = $("#auth-email").value.trim(), password = $("#auth-password").value;
  const username = $("#auth-username").value.trim().toLowerCase(), button = $("#auth-submit");
  button.disabled = true; $("#auth-message").textContent = state.authMode === "signup" ? "Criando sua conta…" : "Entrando…";
  try {
    if (state.authMode === "signup") {
      if (!/^[a-z0-9_-]{3,24}$/.test(username)) throw new Error("Use 3–24 caracteres: letras, números, _ ou -.");
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin, data: { username, display_name: username } } });
      if (error) throw error;
      if (data.session) toast("Conta criada! Bem-vindo ao Voxen.");
      else $("#auth-message").textContent = "Conta criada. Confira seu e-mail para confirmar o cadastro e depois entre.";
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error; toast("Você entrou no Voxen!");
    }
  } catch (error) { $("#auth-message").textContent = error.message || "Não foi possível autenticar."; }
  finally { button.disabled = false; }
});
async function refreshProfile() {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", state.user.id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Seu perfil ainda não foi criado. Confirme o e-mail, entre novamente ou verifique o gatilho de cadastro no Supabase.");
  state.profile = data; const display = data.display_name || data.username;
  $("#profile-display-name").textContent = display; $("#profile-username").textContent = "@" + data.username; const dockName = $("#dock-display-name"); if (dockName) dockName.textContent = display;
  $("#profile-bio").textContent = data.bio || "Sua comunidade começa com você.";
  [$("#profile-avatar"), $("#top-avatar"), $("#composer-avatar"), $("#profile-button")].forEach((el) => {
    if (!el) return;
    el.textContent = initials(display);
    el.style.backgroundImage = data.avatar_url ? "url(" + JSON.stringify(data.avatar_url) + ")" : "none";
    el.classList.toggle("has-avatar-image", !!data.avatar_url);
  });
  const cover = $(".profile-cover"); if (cover) cover.style.backgroundImage = data.cover_url ? "url(" + JSON.stringify(data.cover_url) + ")" : "";
}
async function loadGroups() {
  const { data, error } = await supabase.from("groups").select("id,name,slug,description,is_public,owner_id,created_at").order("created_at", { ascending: false }).limit(100);
  if (error) throw error; state.groups = data || []; renderGroups(); renderDiscover();
}
function renderGroups() {
  const rail = $("#group-rail"), list = $("#group-list"); rail.replaceChildren(); list.replaceChildren();
  state.groups.forEach((group) => {
    const letter = initials(group.name), railButton = document.createElement("button");
    railButton.textContent = letter; railButton.title = group.name; railButton.classList.toggle("active", state.selectedGroup?.id === group.id);
    railButton.addEventListener("click", () => openGroup(group)); rail.append(railButton);
    const item = document.createElement("button");
    item.innerHTML = '<span class="group-symbol">' + escapeHtml(letter) + '</span><span class="group-name">' + escapeHtml(group.name) + '</span>';
    item.classList.toggle("selected", state.selectedGroup?.id === group.id); item.addEventListener("click", () => openGroup(group)); list.append(item);
  });
  if (!state.groups.length) list.innerHTML = '<p class="muted small empty-hint">Ainda não há grupos visíveis. Crie um ou descubra uma comunidade.</p>';
}
function showContent(which) {
  const immersive = which === "group" || which === "chat";
  document.querySelector(".app-shell")?.classList.toggle("immersive-mode", immersive);
  $("#back-home-button").hidden = !immersive;
  $("#members-sidebar").hidden = which !== "group";
  $("#feed-view").hidden = which !== "feed"; $("#discover-view").hidden = which !== "discover"; $("#group-view").hidden = which !== "group";
  $("#breadcrumb-main").textContent = which === "group" ? "Comunidades" : "Comunidade";
  $("#breadcrumb-current").textContent = which === "feed" ? "Feed" : which === "discover" ? "Descobrir grupos" : (state.selectedGroup?.name || "Grupo");
  $("#side-feed").classList.toggle("selected", which === "feed"); $("#side-discover").classList.toggle("selected", which === "discover");
  $("#nav-feed").classList.toggle("active", which === "feed");
}
function openFeed() { showContent("feed"); loadFeed().catch((error) => toast(error.message)); }
$("#nav-feed").addEventListener("click", openFeed); $("#side-feed").addEventListener("click", openFeed);
$("#side-discover").addEventListener("click", () => { showContent("discover"); loadGroups().catch((error) => toast(error.message)); });
$("#search-button").addEventListener("click", () => { showContent("discover"); loadGroups().catch((error) => toast(error.message)); });
function renderDiscover() {
  const root = $("#discover-list"); root.replaceChildren();
  if (!state.groups.length) { root.innerHTML = '<div class="loading-card">Ainda não há comunidades públicas. Seja a primeira pessoa a criar uma!</div>'; return; }
  state.groups.forEach((group) => {
    const card = document.createElement("article"); card.className = "discover-card";
    card.innerHTML = '<div class="group-symbol">' + escapeHtml(initials(group.name)) + '</div><h3>' + escapeHtml(group.name) + '</h3><p>' + escapeHtml(group.description || "Uma comunidade esperando por você.") + '</p><button class="secondary-button">Ver comunidade →</button>';
    card.querySelector("button").addEventListener("click", () => openGroup(group)); root.append(card);
  });
}
async function loadFeed() {
  const root = $("#feed-list"); root.innerHTML = '<div class="loading-card">Carregando publicações…</div>';
  const { data, error } = await supabase.from("feed_posts").select("id,body,created_at,author_id,profiles(display_name,username)").eq("visibility", "public").order("created_at", { ascending: false }).limit(50);
  if (error) throw error; root.replaceChildren();
  if (!data?.length) { root.innerHTML = '<div class="empty-state"><span>✧</span><strong>Seu feed começa aqui</strong><p>Compartilhe a primeira ideia com a comunidade.</p></div>'; return; }
  data.forEach((post) => {
    const author = post.profiles || {}, name = author.display_name || author.username || "Membro Voxen", card = document.createElement("article");
    card.className = "post-card";
    card.innerHTML = '<div class="post-head"><div class="avatar">' + escapeHtml(initials(name)) + '</div><div><strong>' + escapeHtml(name) + '</strong><div class="post-meta">@' + escapeHtml(author.username || "voxen") + ' · ' + escapeHtml(formatDate(post.created_at)) + '</div></div></div><p class="post-body"></p><div class="post-actions"><button type="button" aria-label="Curtir publicação">♡ Curtir</button><span>✧ Publicação da comunidade</span></div>';
    card.querySelector(".post-body").textContent = post.body;
    card.querySelector(".post-actions button").addEventListener("click", () => toggleLike(post.id)); root.append(card);
  });
}
async function toggleLike(postId) {
  const { data: existing, error: readError } = await supabase.from("post_likes").select("post_id").eq("post_id", postId).eq("user_id", state.user.id).maybeSingle();
  if (readError) { toast(readError.message); return; }
  if (existing) {
    const { error } = await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", state.user.id);
    if (error) toast(error.message); else toast("Curtida removida.");
  } else {
    const { error } = await supabase.from("post_likes").insert({ post_id: postId, user_id: state.user.id });
    if (error) toast(error.message); else toast("Você curtiu esta publicação.");
  }
}
$("#post-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const body = $("#post-body").value.trim(); if (!body) return;
  const button = event.currentTarget.querySelector("button"); button.disabled = true;
  try {
    const { error } = await supabase.from("feed_posts").insert({ author_id: state.user.id, body, visibility: "public" });
    if (error) throw error; $("#post-body").value = ""; await loadFeed(); toast("Publicação enviada!");
  } catch (error) { toast(error.message); } finally { button.disabled = false; }
});
$("#top-create-post").addEventListener("click", () => { openFeed(); $("#post-body").focus(); });
$("#tip-post").addEventListener("click", () => { openFeed(); $("#post-body").focus(); });
function openCreateGroup() { $("#create-group-form").reset(); $("#group-form-message").textContent = ""; delete $("#new-group-slug").dataset.edited; $("#create-group-dialog").showModal(); }
$("#open-create-group").addEventListener("click", openCreateGroup); $("#create-group-small").addEventListener("click", openCreateGroup); $("#tip-create-group").addEventListener("click", openCreateGroup);
$("#new-group-name").addEventListener("input", () => {
  const slug = $("#new-group-slug");
  if (!slug.dataset.edited) slug.value = $("#new-group-name").value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
});
$("#new-group-slug").addEventListener("input", (event) => { event.target.dataset.edited = "1"; event.target.value = event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""); });
$("#create-group-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true; $("#group-form-message").textContent = "Criando comunidade…";
  try {
    const name = $("#new-group-name").value.trim(), slug = $("#new-group-slug").value.trim(), description = $("#new-group-description").value.trim();
    const { data: group, error } = await supabase.from("groups").insert({ name, slug, description, is_public: true, owner_id: state.user.id }).select().single();
    if (error) throw error;
    const { error: memberError } = await supabase.from("group_members").insert({ group_id: group.id, user_id: state.user.id, role: "owner" });
    if (memberError) throw memberError;
    const { error: channelError } = await supabase.from("text_channels").insert({ group_id: group.id, name: "geral", topic: "Conversa geral da comunidade", position: 0 });
    if (channelError) throw channelError;
    const { error: voiceError } = await supabase.from("voice_rooms").insert({ group_id: group.id, name: "Sala de voz", position: 0 });
    if (voiceError) throw voiceError;
    $("#create-group-dialog").close(); await loadGroups(); await openGroup(group); toast("Comunidade criada com sucesso!");
  } catch (error) { $("#group-form-message").textContent = error.message || "Não foi possível criar a comunidade."; }
  finally { button.disabled = false; }
});

async function loadGroupMembers(groupId) {
  const onlineRoot = $("#online-members"), offlineRoot = $("#offline-members");
  onlineRoot.replaceChildren(); offlineRoot.replaceChildren();
  const { data, error } = await supabase.from("group_members").select("user_id,profiles(id,username,display_name,avatar_url)").eq("group_id", groupId);
  if (error) { console.warn("Membros da comunidade:", error.message); return; }
  const members = [...new Map((data || []).map((m) => [m.user_id, m])).values()]; $("#member-count").textContent = String(members.length);
  // Presence in text/voice is temporary; the list below is a member directory, not a fabricated online indicator.
  members.forEach((membership) => {
    const profile = membership.profiles || {}, item = document.createElement("div"); item.className = "member-item";
    const avatar = document.createElement("span"); avatar.className = "member-avatar";
    avatar.textContent = initials(profile.display_name || profile.username || "P"); if (profile.avatar_url) { avatar.style.backgroundImage = "url(" + JSON.stringify(profile.avatar_url) + ")"; avatar.classList.add("has-image"); }
    const label = document.createElement("span"); label.textContent = profile.display_name || profile.username || "Jogador";
    item.append(avatar, label); item.classList.add(state.onlineUserIds.has(membership.user_id) ? "member-online" : "member-offline"); (state.onlineUserIds.has(membership.user_id) ? onlineRoot : offlineRoot).append(item);
  });
  if (!members.length) offlineRoot.innerHTML = '<p class="muted small">Ainda não há membros.</p>';
  if (!onlineRoot.children.length) onlineRoot.innerHTML = '<p class="muted small">Ninguém online no momento.</p>';
  if (!offlineRoot.children.length) offlineRoot.innerHTML = '<p class="muted small">Ninguém offline.</p>';
}

async function watchGroupPresence(groupId) {
  if (state.groupPresence) { await supabase.removeChannel(state.groupPresence); state.groupPresence = null; }
  state.onlineUserIds = new Set();
  const channel = supabase.channel("voxen-presence-" + groupId, { config: { presence: { key: state.user.id } } });
  state.groupPresence = channel;
  channel.on("presence", { event: "sync" }, () => {
    if (state.groupPresence !== channel) return;
    const ids = new Set(Object.values(channel.presenceState()).flat().map(entry => entry.user_id).filter(Boolean));
    state.onlineUserIds = ids; loadGroupMembers(groupId).catch((e) => console.warn("Presence members:", e));
  });
  channel.subscribe(async (status) => {
    if (status === "SUBSCRIBED" && state.groupPresence === channel) {
      await channel.track({ user_id: state.user.id, username: state.profile?.username, online_at: new Date().toISOString() });
    }
  });
}
async function openGroup(group) {
  state.selectedGroup = group; renderGroups(); showContent("group"); watchGroupPresence(group.id).catch((e) => console.warn("Presence:", e));
  $("#group-title").textContent = group.name; $("#group-description").textContent = group.description || "Bem-vindo a esta comunidade.";
  $("#group-cover-icon").textContent = initials(group.name); $("#join-group-button").hidden = true;
  $("#channel-list").innerHTML = '<p class="muted small">Carregando…</p>'; $("#voice-list").replaceChildren();
  try {
    const { data: membership, error: memberError } = await supabase.from("group_members").select("role").eq("group_id", group.id).eq("user_id", state.user.id).maybeSingle();
    if (memberError) throw memberError;
    const isMember = !!membership; state.currentMemberRole = membership?.role || null; $("#join-group-button").hidden = isMember;
    $("#add-channel-button").hidden = !isMember || !["owner", "admin"].includes(membership.role); $("#add-voice-button").hidden = !isMember || !["owner", "admin"].includes(membership.role);
    const [channelsResult, voicesResult] = await Promise.all([
      supabase.from("text_channels").select("*").eq("group_id", group.id).order("position"),
      supabase.from("voice_rooms").select("*").eq("group_id", group.id).order("position")
    ]);
    if (channelsResult.error) throw channelsResult.error; if (voicesResult.error) throw voicesResult.error;
    state.channels = channelsResult.data || []; state.voiceRooms = voicesResult.data || []; renderChannels(); renderVoiceRooms(state.voiceRooms); await loadGroupMembers(group.id);
    if (!isMember) {
      state.selectedChannel = null; $("#channel-title").textContent = "Participe para conversar";
      $("#message-form").hidden = true; $("#message-list").innerHTML = '<div class="empty-state"><span>✧</span><strong>Entre nesta comunidade</strong><p>Você pode ver os canais públicos. Participe para ler e enviar mensagens.</p></div>';
    } else if (state.channels.length) await openChannel(state.channels[0]);
    else {
      state.selectedChannel = null; $("#channel-title").textContent = "Sem canais";
      $("#message-list").innerHTML = '<div class="empty-state"><span>✧</span><strong>Sem canais de texto</strong><p>Um administrador pode criar o primeiro canal.</p></div>';
      $("#message-form").hidden = true;
    }
  } catch (error) { toast(error.message); }
}
$("#join-group-button").addEventListener("click", async () => {
  if (!state.selectedGroup) return;
  const { error } = await supabase.from("group_members").insert({ group_id: state.selectedGroup.id, user_id: state.user.id, role: "member" });
  if (error) { toast(error.message); return; } toast("Você entrou na comunidade!"); await openGroup(state.selectedGroup);
});
function renderChannels() {
  const root = $("#channel-list"); root.replaceChildren();
  state.channels.forEach((channel) => {
    const button = document.createElement("button"); button.className = "channel-item" + (state.selectedChannel?.id === channel.id ? " active" : "");
    button.innerHTML = '<span>#</span>' + escapeHtml(channel.name); button.addEventListener("click", () => openChannel(channel)); root.append(button);
  });
}
function renderVoiceRooms(rooms) {
  const root = $("#voice-list"); root.replaceChildren();
  if (!rooms.length) { root.innerHTML = '<p class="muted small">Nenhuma sala ainda.</p>'; return; }
  rooms.forEach((room) => {
    const wrap = document.createElement("div"); wrap.className = "voice-room-wrap";
    const active = state.voice?.room.id === room.id;
    const button = document.createElement("button"); button.className = "channel-item voice-channel-item" + (active ? " voice-active" : "");
    button.innerHTML = '<span class="voice-room-icon">◖))</span><span class="voice-room-label">' + escapeHtml(room.name) + '</span>' + (active ? '<span class="voice-live-dot" title="Conectado"></span>' : '');
    button.addEventListener("click", () => active ? toast("Você já está conectado a esta sala.") : joinVoiceRoom(room)); wrap.append(button);
    if (active) {
      const child = document.createElement("div"); child.className = "voice-room-participants";
      const presenceEntries = state.voice?.participants || [];
      const entries = [...new Map(presenceEntries.filter((entry) => entry.user_id).map((entry) => [entry.user_id, entry])).values()];
      if (!entries.some((entry) => entry.user_id === state.user?.id)) entries.unshift({ user_id: state.user?.id, display_name: state.profile?.display_name || state.profile?.username || "Você", username: state.profile?.username, avatar_url: state.profile?.avatar_url || null });
      entries.forEach((entry) => {
        const member = document.createElement("div"); member.className = "voice-room-self";
        const avatar = document.createElement("span"); avatar.className = "voice-self-avatar"; avatar.textContent = initials(entry.display_name || entry.username || "P");
        if (entry.avatar_url) { avatar.style.backgroundImage = "url(" + JSON.stringify(entry.avatar_url) + ")"; avatar.classList.add("has-image"); }
        const name = document.createElement("span"); name.textContent = entry.display_name || entry.username || (entry.user_id === state.user?.id ? "Você" : "Membro");
        member.append(avatar, name); child.append(member);
      });
      wrap.append(child);
    }
    root.append(wrap);
  });
}

const VOICE_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" }
];
function voiceSend(to, kind, data) {
  const voice = state.voice;
  if (!voice?.channel) return Promise.resolve();
  return voice.channel.send({ type: "broadcast", event: "signal", payload: { from: state.user.id, to, kind, data } });
}
function voiceMediaCard(peerId) {
  const root = $("#voice-media-grid");
  let card = root.querySelector('[data-peer-id="' + CSS.escape(peerId) + '"]');
  if (card) return card;
  card = document.createElement("div"); card.className = "voice-media-card"; card.dataset.peerId = peerId;
  const label = document.createElement("strong"); label.textContent = "Participante " + peerId.slice(0, 6);
  const audio = document.createElement("audio"); audio.autoplay = true; audio.playsInline = true;
  const video = document.createElement("video"); video.autoplay = true; video.playsInline = true; video.hidden = true;
  card.append(label, audio, video); root.append(card);
  return card;
}
async function makeVoicePeer(remoteId) {
  if (state.voice?.peers.has(remoteId)) return state.voice.peers.get(remoteId);
  const voice = state.voice;
  if (!voice) return null;
  const pc = new RTCPeerConnection({ iceServers: VOICE_ICE_SERVERS });
  const peer = { pc, remoteId, audioStream: new MediaStream(), videoStream: new MediaStream(), card: null };
  peer.card = voiceMediaCard(remoteId);
  voice.localStream.getAudioTracks().forEach((track) => pc.addTrack(track, voice.localStream));
  if (voice.screenStream) voice.screenStream.getVideoTracks().forEach((track) => { peer.screenSender = pc.addTrack(track, voice.screenStream); });
  pc.onicecandidate = (event) => { if (event.candidate) voiceSend(remoteId, "ice", event.candidate.toJSON()); };
  pc.ontrack = (event) => {
    if (!state.voice || state.voice !== voice) return;
    const track = event.track;
    if (track.kind === "audio") {
      peer.audioStream.addTrack(track);
      const audio = peer.card.querySelector("audio"); audio.srcObject = peer.audioStream; audio.muted = !!voice.outputMuted;
      audio.play().catch(() => {});
    } else if (track.kind === "video") {
      peer.videoStream.addTrack(track);
      const video = peer.card.querySelector("video"); video.srcObject = peer.videoStream; video.hidden = false;
      video.play().catch(() => {});
    }
  };
  pc.onconnectionstatechange = () => {
    if (["failed", "closed"].includes(pc.connectionState)) removeVoicePeer(remoteId);
  };
  pc.onsignalingstatechange = () => {
    if (pc.signalingState === "stable" && peer.needsNegotiation && state.voice === voice) {
      peer.needsNegotiation = false;
      renegotiateVoicePeer(remoteId, peer).catch((error) => console.warn("Renegociação WebRTC:", error));
    }
  };
  voice.peers.set(remoteId, peer);
  return peer;
}
async function renegotiateVoicePeer(remoteId, peer) {
  if (!state.voice) return;
  if (state.user.id.localeCompare(remoteId) > 0) {
    await voiceSend(remoteId, "renegotiate", {});
    return;
  }
  if (peer.pc.signalingState !== "stable") { peer.needsNegotiation = true; return; }
  const offer = await peer.pc.createOffer();
  await peer.pc.setLocalDescription(offer);
  await voiceSend(remoteId, "offer", peer.pc.localDescription.toJSON());
}
async function flushVoiceIce(peer) {
  const voice = state.voice;
  const queued = voice?.pendingIce.get(peer.remoteId) || [];
  voice?.pendingIce.delete(peer.remoteId);
  for (const candidate of queued) {
    try { await peer.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (error) { console.warn("ICE candidate:", error); }
  }
}
async function handleVoiceSignal({ payload }) {
  const voice = state.voice;
  if (!voice || !payload || payload.to !== state.user.id || payload.from === state.user.id) return;
  try {
    let peer = voice.peers.get(payload.from);
    if (payload.kind === "offer") {
      peer = peer || await makeVoicePeer(payload.from);
      await peer.pc.setRemoteDescription(new RTCSessionDescription(payload.data));
      await flushVoiceIce(peer);
      const answer = await peer.pc.createAnswer(); await peer.pc.setLocalDescription(answer);
      await voiceSend(payload.from, "answer", peer.pc.localDescription.toJSON());
    } else if (payload.kind === "answer" && peer) {
      await peer.pc.setRemoteDescription(new RTCSessionDescription(payload.data));
      await flushVoiceIce(peer);
    } else if (payload.kind === "renegotiate") {
      if (state.user.id.localeCompare(payload.from) < 0 && peer) await renegotiateVoicePeer(payload.from, peer);
    } else if (payload.kind === "ice") {
      if (peer?.pc.remoteDescription) await peer.pc.addIceCandidate(new RTCIceCandidate(payload.data));
      else {
        const queue = voice.pendingIce.get(payload.from) || []; queue.push(payload.data); voice.pendingIce.set(payload.from, queue);
      }
    }
  } catch (error) { console.warn("Sinalização WebRTC:", error); }
}
async function syncVoicePeers() {
  const voice = state.voice;
  if (!voice?.channel) return;
  const presence = voice.channel.presenceState();
  const presenceEntries = [...new Map(Object.values(presence).flat().filter((entry) => entry.user_id).map((entry) => [entry.user_id, entry])).values()];
  voice.participants = presenceEntries;
  const remoteIds = presenceEntries.map((entry) => entry.user_id).filter((id) => id !== state.user.id);
  renderVoiceRooms(state.voiceRooms);
  for (const remoteId of voice.peers.keys()) if (!remoteIds.includes(remoteId)) removeVoicePeer(remoteId);
  $("#voice-status").textContent = "Conectado · " + (remoteIds.length + 1) + " participante(s)";
  for (const remoteId of remoteIds) {
    if (state.user.id.localeCompare(remoteId) < 0 && !voice.peers.has(remoteId)) {
      try {
        const peer = await makeVoicePeer(remoteId);
        await renegotiateVoicePeer(remoteId, peer);
      } catch (error) { console.warn("Não foi possível iniciar conexão de voz:", error); }
    }
  }
}
async function joinVoiceRoom(room) {
  if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
    toast("Este navegador não oferece suporte a WebRTC. Use uma versão recente do Chrome, Edge, Firefox ou Safari.");
    return;
  }
  if (state.voice) await leaveVoiceRoom(true);
  const { data: membership, error: membershipError } = await supabase.from("group_members").select("user_id").eq("group_id", room.group_id).eq("user_id", state.user.id).maybeSingle();
  if (membershipError) { toast(membershipError.message); return; }
  if (!membership) { toast("Entre na comunidade antes de participar da sala de voz."); return; }
  $("#voice-room-name").textContent = room.name;
  $("#voice-status").textContent = "Solicitando acesso ao microfone…";
  $("#voice-media-grid").replaceChildren();
  $("#voice-dialog").classList.add("voice-connected"); document.body.classList.add("voice-active"); updateVoiceDock();
  try {
    const localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const voice = { room, channel: null, localStream, screenStream: null, peers: new Map(), pendingIce: new Map(), muted: false };
    state.voice = voice;
    const channel = supabase.channel("voxen-voice-" + room.id, { config: { broadcast: { self: false }, presence: { key: state.user.id } } });
    voice.channel = channel;
    channel.on("broadcast", { event: "signal" }, handleVoiceSignal);
    channel.on("presence", { event: "sync" }, () => syncVoicePeers().catch((error) => console.warn("Presença de voz:", error)));
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED" && state.voice === voice) {
        await channel.track({ user_id: state.user.id, username: state.profile?.username || "player", display_name: state.profile?.display_name || state.profile?.username || "Você", avatar_url: state.profile?.avatar_url || null, joined_at: new Date().toISOString() });
        renderVoiceRooms(state.voiceRooms);
        await syncVoicePeers();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        $("#voice-status").textContent = "Não foi possível conectar à sala. Verifique sua conexão."; toast("Não foi possível conectar à sala de voz.");
      }
    });
    $("#voice-mute-button").textContent = "Silenciar microfone";
    $("#voice-share-button").textContent = "Compartilhar tela"; updateVoiceDock();
    $("#voice-status").textContent = "Conectado à sala de voz"; updateVoiceDock(); toast("Você entrou na sala de voz.");
  } catch (error) {
    await leaveVoiceRoom(false);
    $("#voice-dialog").classList.remove("voice-connected"); document.body.classList.remove("voice-active"); updateVoiceDock();
    toast(error.name === "NotAllowedError" ? "Permita o uso do microfone no navegador para entrar na sala." : "Não foi possível acessar o microfone: " + error.message);
  }
}
function updateVoiceDock() {
  const active = !!state.voice;
  const dock = $("#voice-dock"); if (dock) dock.hidden = !active;
  const name = $("#voice-dock-name"); if (name) name.textContent = active ? state.voice.room.name : ""; const status = $("#voice-dock-status"); if (status) status.textContent = active ? "Conectado · voz ativa" : ""; const quality = $("#voice-quality"); if (quality) { quality.className = "voice-quality good"; quality.textContent = "● Conectado"; }
  const output = $("#voice-dock-output"); if (output) { output.textContent = state.voice?.outputMuted ? "♫ Ativar áudio" : "♫ Áudio"; output.setAttribute("aria-pressed", String(!!state.voice?.outputMuted)); }
  const mute = $("#voice-dock-mute"); if (mute) { mute.textContent = state.voice?.muted ? "🎙️ Ativar microfone" : "🎤 Silenciar"; mute.setAttribute("aria-pressed", String(!!state.voice?.muted)); }
  const share = $("#voice-dock-share"); if (share) share.textContent = state.voice?.screenStream ? "▣ Parar tela" : "▧ Compartilhar tela";
  const accountName = $("#dock-display-name"); if (accountName) accountName.textContent = state.profile?.display_name || state.profile?.username || "Seu perfil";
  const accountAvatar = $("#profile-button");
  if (accountAvatar && state.profile) {
    accountAvatar.textContent = initials(state.profile.display_name || state.profile.username);
    accountAvatar.style.backgroundImage = state.profile.avatar_url ? "url(" + JSON.stringify(state.profile.avatar_url) + ")" : "none";
    accountAvatar.classList.toggle("has-avatar-image", !!state.profile.avatar_url);
  }
  if (state.selectedGroup) renderVoiceRooms(state.voiceRooms);
}
$("#voice-dock-mute")?.addEventListener("click", toggleVoiceMute);
$("#voice-dock-share")?.addEventListener("click", () => state.voice?.screenStream ? stopScreenShare() : startScreenShare());
$("#voice-dock-output")?.addEventListener("click", () => {
  const voice = state.voice; if (!voice) return;
  voice.outputMuted = !voice.outputMuted;
  voice.peers.forEach((peer) => { const audio = peer.card?.querySelector("audio"); if (audio) audio.muted = voice.outputMuted; });
  updateVoiceDock();
});
$("#voice-dock-leave")?.addEventListener("click", () => leaveVoiceRoom(true));
function removeVoicePeer(remoteId) {
  const voice = state.voice, peer = voice?.peers.get(remoteId);
  if (!peer) return;
  try { peer.pc.close(); } catch {}
  peer.card?.remove(); voice.peers.delete(remoteId);
}
async function toggleVoiceMute() {
  const voice = state.voice; if (!voice) return;
  voice.muted = !voice.muted;
  voice.localStream.getAudioTracks().forEach((track) => { track.enabled = !voice.muted; });
  $("#voice-mute-button").textContent = voice.muted ? "Ativar microfone" : "Silenciar microfone";
}
async function startScreenShare() {
  const voice = state.voice; if (!voice) return;
  if (!navigator.mediaDevices?.getDisplayMedia) { toast("Seu navegador não oferece compartilhamento de tela."); return; }
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
    if (state.voice !== voice) { stream.getTracks().forEach((track) => track.stop()); return; }
    voice.screenStream = stream;
    const track = stream.getVideoTracks()[0];
    track.addEventListener("ended", () => stopScreenShare());
    for (const [remoteId, peer] of voice.peers) {
      peer.screenSender = peer.pc.addTrack(track, stream);
      await renegotiateVoicePeer(remoteId, peer);
    }
    $("#voice-share-button").textContent = "Parar compartilhamento"; updateVoiceDock();
    toast("Compartilhamento de tela iniciado.");
  } catch (error) {
    if (error.name !== "NotAllowedError") toast("Não foi possível compartilhar a tela: " + error.message);
  }
}
async function stopScreenShare() {
  const voice = state.voice; if (!voice?.screenStream) return;
  const stream = voice.screenStream; voice.screenStream = null;
  stream.getTracks().forEach((track) => track.stop());
  for (const [remoteId, peer] of voice.peers) {
    const sender = peer.screenSender;
    if (sender) { try { peer.pc.removeTrack(sender); } catch {} peer.screenSender = null; }
    try { await renegotiateVoicePeer(remoteId, peer); }
    catch (error) { console.warn("Não foi possível encerrar compartilhamento:", error); }
  }
  $("#voice-share-button").textContent = "Compartilhar tela";
}
async function leaveVoiceRoom(closeDialog = true) {
  const voice = state.voice;
  if (voice) {
    state.voice = null;
    try { if (voice.channel) { await voice.channel.untrack(); await supabase.removeChannel(voice.channel); } } catch {}
    voice.peers.forEach((peer) => { try { peer.pc.close(); } catch {} peer.card?.remove(); });
    voice.screenStream?.getTracks().forEach((track) => track.stop());
    voice.localStream?.getTracks().forEach((track) => track.stop());
  }
  $("#voice-media-grid")?.replaceChildren();
  $("#voice-dialog").classList.remove("voice-connected"); document.body.classList.remove("voice-active"); updateVoiceDock();
}
$("#voice-mute-button").addEventListener("click", toggleVoiceMute);
$("#voice-share-button").addEventListener("click", () => state.voice?.screenStream ? stopScreenShare() : startScreenShare());
$("#voice-leave-button").addEventListener("click", () => leaveVoiceRoom(true));
$("#voice-close-button").addEventListener("click", () => leaveVoiceRoom(true));
$("#voice-dialog").addEventListener("cancel", () => { leaveVoiceRoom(false); });

async function openChannel(channel) {
  if (state.messageSubscription) { await supabase.removeChannel(state.messageSubscription); state.messageSubscription = null; }
  state.selectedChannel = channel; renderChannels(); $("#channel-title").textContent = "# " + channel.name;
  $("#message-form").hidden = false; $("#message-body").placeholder = "Mensagem em #" + channel.name;
  $("#message-list").innerHTML = '<div class="loading-card">Carregando mensagens…</div>';
  try {
    const { data, error } = await supabase.from("messages").select("id,content,created_at,author_id,profiles(display_name,username)").eq("channel_id", channel.id).order("created_at", { ascending: true }).limit(100);
    if (error) throw error; const root = $("#message-list"); root.replaceChildren();
    if (!data?.length) root.innerHTML = '<div class="empty-state"><span>✧</span><strong>O começo de uma conversa</strong><p>Envie a primeira mensagem deste canal.</p></div>';
    (data || []).forEach(renderMessage); root.scrollTop = root.scrollHeight;
    state.messageSubscription = supabase.channel("voxen-messages-" + channel.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "channel_id=eq." + channel.id }, (payload) => {
        if (payload.new.author_id === state.user?.id || state.selectedChannel?.id !== channel.id) return;
        const incoming = payload.new;
        supabase.from("profiles").select("display_name,username").eq("id", incoming.author_id).maybeSingle()
          .then(({ data: author }) => { if (state.selectedChannel?.id === channel.id) { renderMessage({ ...incoming, profiles: author || {} }); root.scrollTop = root.scrollHeight; } });
      }).subscribe();
  } catch (error) { toast(error.message); }
}
function renderMessage(message) {
  const author = message.profiles || {}, name = author.display_name || author.username || "Membro Voxen", root = $("#message-list");
  const empty = root.querySelector(".empty-state"); if (empty) empty.remove();
  const row = document.createElement("div"); row.className = "message-row";
  row.innerHTML = '<div class="message-avatar">' + escapeHtml(initials(name)) + '</div><div class="message-content"><div class="message-meta"><strong>' + escapeHtml(name) + '</strong><time>' + escapeHtml(formatDate(message.created_at)) + '</time></div><div class="message-text"></div></div>';
  row.querySelector(".message-text").textContent = message.content; root.append(row);
}
$("#message-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const content = $("#message-body").value.trim(); if (!content || !state.selectedChannel) return;
  const button = event.currentTarget.querySelector("button"); button.disabled = true;
  try {
    const { data, error } = await supabase.from("messages").insert({ channel_id: state.selectedChannel.id, author_id: state.user.id, content }).select("id,content,created_at,author_id,profiles(display_name,username)").single();
    if (error) throw error; $("#message-body").value = ""; renderMessage(data); $("#message-list").scrollTop = $("#message-list").scrollHeight;
  } catch (error) { toast(error.message); } finally { button.disabled = false; }
});
$("#back-home-button").addEventListener("click", () => openFeed());
$("#add-voice-button").addEventListener("click", async () => {
  if (!state.selectedGroup) return;
  const name = prompt("Nome da nova sala de voz (ex.: Geral):");
  if (!name?.trim()) return;
  try {
    const { error } = await supabase.from("voice_rooms").insert({ group_id: state.selectedGroup.id, name: name.trim().slice(0, 64), position: 0 });
    if (error) throw error;
    await openGroup(state.selectedGroup); toast("Sala de voz criada!");
  } catch (error) { toast(error.message); }
});
$("#add-channel-button").addEventListener("click", async () => {
  if (!state.selectedGroup) return; const name = prompt("Nome do novo canal (ex.: ajuda):"); if (!name || !name.trim()) return;
  const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 64);
  try {
    const { error } = await supabase.from("text_channels").insert({ group_id: state.selectedGroup.id, name: cleanName, position: state.channels.length });
    if (error) throw error; await openGroup(state.selectedGroup); toast("Canal criado!");
  } catch (error) { toast(error.message); }
});
$("#logout-button").addEventListener("click", async () => { const { error } = await supabase.auth.signOut(); if (error) toast(error.message); });
function openProfileEditor() {
  if (!state.profile) return;
  $("#edit-display-name").value = state.profile.display_name || "";
  $("#edit-bio").value = state.profile.bio || "";
  $("#profile-form-message").textContent = "";
  $("#edit-avatar-file").value = ""; $("#edit-cover-file").value = "";
  $("#profile-dialog").showModal();
}
$("#profile-button").addEventListener("click", openProfileEditor);
$("#top-avatar").addEventListener("click", openProfileEditor); $("#dock-profile-settings")?.addEventListener("click", openProfileEditor);
$("#profile-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true; $("#profile-form-message").textContent = "Salvando perfil…";
  try {
    const display_name = $("#edit-display-name").value.trim();
    const bio = $("#edit-bio").value.trim();
    const updates = { display_name, bio, updated_at: new Date().toISOString() };
    for (const [inputId, field, prefix] of [["edit-avatar-file","avatar_url","avatar"],["edit-cover-file","cover_url","cover"]]) {
      const file = $("#" + inputId).files?.[0];
      if (!file) continue;
      if (file.size > 5 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 5 MB.");
      if (!["image/png","image/jpeg","image/webp"].includes(file.type)) throw new Error("Use uma imagem PNG, JPG ou WebP.");
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = state.user.id + "/" + prefix + "-" + Date.now() + "." + ext;
      const { error: uploadError } = await supabase.storage.from("voxen-profile-media").upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      updates[field] = supabase.storage.from("voxen-profile-media").getPublicUrl(path).data.publicUrl;
    }
    const { data, error } = await supabase.from("profiles").update(updates).eq("id", state.user.id).select().single();
    if (error) throw error;
    state.profile = data;
    const display = data.display_name || data.username;
    $("#profile-display-name").textContent = display;
    $("#profile-username").textContent = "@" + data.username;
    $("#profile-avatar").textContent = initials(display); $("#top-avatar").textContent = initials(display);
    $("#profile-bio").textContent = data.bio || "Sua comunidade começa com você.";
    [$("#profile-avatar"), $("#top-avatar"), $("#composer-avatar"), $("#profile-button")].forEach((el) => { if (!el) return; el.textContent = initials(display); el.style.backgroundImage = data.avatar_url ? "url(" + JSON.stringify(data.avatar_url) + ")" : "none"; el.classList.toggle("has-avatar-image", !!data.avatar_url); });
    const cover = $(".profile-cover"); if (cover) cover.style.backgroundImage = data.cover_url ? "url(" + JSON.stringify(data.cover_url) + ")" : "";
    $("#profile-dialog").close(); toast("Perfil atualizado!");
  } catch (error) { $("#profile-form-message").textContent = error.message || "Não foi possível salvar o perfil."; }
  finally { button.disabled = false; }
});
$("#reset-password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true; $("#reset-password-message").textContent = "Atualizando senha…";
  try {
    const { error } = await supabase.auth.updateUser({ password: $("#reset-password-value").value });
    if (error) throw error;
    $("#reset-password-dialog").close(); $("#reset-password-value").value = "";
    toast("Senha atualizada! Sua conta está pronta para uso.");
  } catch (error) { $("#reset-password-message").textContent = error.message || "Não foi possível atualizar a senha."; }
  finally { button.disabled = false; }
});
$("#forgot-password").addEventListener("click", async () => {
  const email = $("#auth-email").value.trim();
  if (!email) { $("#auth-message").textContent = "Digite seu e-mail acima e clique em Esqueci minha senha."; $("#auth-email").focus(); return; }
  const button = $("#forgot-password"); button.disabled = true; $("#auth-message").textContent = "Enviando link de recuperação…";
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) throw error;
    $("#auth-message").textContent = "Se esse e-mail estiver cadastrado, você receberá um link para redefinir a senha. Confira também o spam.";
  } catch (error) { $("#auth-message").textContent = error.message || "Não foi possível enviar o e-mail de recuperação."; }
  finally { button.disabled = false; }
});
$("#help-button").addEventListener("click", () => $("#help-dialog").showModal());
$("#sidebar-menu").addEventListener("click", () => $("#help-dialog").showModal());
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => document.getElementById(button.dataset.close).close()));
document.querySelectorAll("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }));
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); showContent("discover"); loadGroups().catch((error) => toast(error.message)); }
});
let installPrompt;
window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); installPrompt = event; $("#install-button").hidden = false; });
$("#install-button").addEventListener("click", async () => {
  if (!installPrompt) { toast("Use o menu do navegador para instalar o Voxen."); return; }
  installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; $("#install-button").hidden = true;
});
window.addEventListener("appinstalled", () => toast("Voxen instalado!"));
async function onAuthChange(user) {
  if (!user) {
    if (state.groupPresence) { await supabase.removeChannel(state.groupPresence); state.groupPresence = null; }
    if (state.voice) await leaveVoiceRoom(true);
    if (state.messageSubscription) { await supabase.removeChannel(state.messageSubscription); state.messageSubscription = null; }
    if (state.feedSubscription) { await supabase.removeChannel(state.feedSubscription); state.feedSubscription = null; }
  }
  state.user = user; $("#auth-view").hidden = !!user; $("#signed-in-view").hidden = !user;
  if (!user) { state.profile = null; state.groups = []; state.selectedGroup = null; state.selectedChannel = null; return; }
  try {
    await refreshProfile(); await loadGroups(); await loadFeed(); showContent("feed");
    if (state.feedSubscription) await supabase.removeChannel(state.feedSubscription);
    state.feedSubscription = supabase.channel("voxen-feed-" + user.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "feed_posts" }, () => loadFeed().catch((error) => console.warn("Feed realtime:", error.message)))
      .subscribe();
  }
  catch (error) { toast("Erro ao carregar o Voxen: " + error.message); }
}
supabase.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    setTimeout(() => { $("#reset-password-message").textContent = ""; $("#reset-password-dialog").showModal(); }, 0);
  }
  setTimeout(() => onAuthChange(session?.user || null), 0);
});
supabase.auth.getSession().then(({ data, error }) => { if (error) toast(error.message); if (!data.session) onAuthChange(null); });
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/service-worker.js").catch((error) => console.warn("Service worker não registrado:", error)));
}