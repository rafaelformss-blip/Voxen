/* Voxen frontend. Only the publishable Supabase key belongs in browser code. */
const SUPABASE_URL = "https://kldphrwrdpdbeidgvqfl.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_JQbVo4uU_fykam905ziYbA_cFcKpIar";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = (selector) => document.querySelector(selector);
const state = { user: null, profile: null, groups: [], selectedGroup: null, channels: [], selectedChannel: null, authMode: "login", messageSubscription: null, feedSubscription: null };
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
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username, display_name: username } } });
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
  $("#profile-display-name").textContent = display; $("#profile-username").textContent = "@" + data.username;
  $("#profile-avatar").textContent = initials(display); $("#top-avatar").textContent = initials(display);
  $("#composer-avatar").textContent = initials(display); $("#profile-button").textContent = initials(display);
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
async function openGroup(group) {
  state.selectedGroup = group; renderGroups(); showContent("group");
  $("#group-title").textContent = group.name; $("#group-description").textContent = group.description || "Bem-vindo a esta comunidade.";
  $("#group-cover-icon").textContent = initials(group.name); $("#join-group-button").hidden = true;
  $("#channel-list").innerHTML = '<p class="muted small">Carregando…</p>'; $("#voice-list").replaceChildren();
  try {
    const { data: membership, error: memberError } = await supabase.from("group_members").select("role").eq("group_id", group.id).eq("user_id", state.user.id).maybeSingle();
    if (memberError) throw memberError;
    const isMember = !!membership; $("#join-group-button").hidden = isMember;
    $("#add-channel-button").hidden = !isMember || !["owner", "admin"].includes(membership.role);
    const [channelsResult, voicesResult] = await Promise.all([
      supabase.from("text_channels").select("*").eq("group_id", group.id).order("position"),
      supabase.from("voice_rooms").select("*").eq("group_id", group.id).order("position")
    ]);
    if (channelsResult.error) throw channelsResult.error; if (voicesResult.error) throw voicesResult.error;
    state.channels = channelsResult.data || []; renderChannels(); renderVoiceRooms(voicesResult.data || []);
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
    const button = document.createElement("button"); button.className = "channel-item"; button.innerHTML = '<span>◖))</span>' + escapeHtml(room.name);
    button.addEventListener("click", () => toast("Salas de voz serão ativadas na próxima etapa com WebRTC. Nenhum áudio é gravado.")); root.append(button);
  });
}
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
  $("#profile-dialog").showModal();
}
$("#profile-button").addEventListener("click", openProfileEditor);
$("#top-avatar").addEventListener("click", openProfileEditor);
$("#profile-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true; $("#profile-form-message").textContent = "Salvando perfil…";
  try {
    const display_name = $("#edit-display-name").value.trim();
    const bio = $("#edit-bio").value.trim();
    const { data, error } = await supabase.from("profiles").update({ display_name, bio, updated_at: new Date().toISOString() }).eq("id", state.user.id).select().single();
    if (error) throw error;
    state.profile = data;
    const display = data.display_name || data.username;
    $("#profile-display-name").textContent = display;
    $("#profile-username").textContent = "@" + data.username;
    $("#profile-avatar").textContent = initials(display); $("#top-avatar").textContent = initials(display);
    $("#composer-avatar").textContent = initials(display); $("#profile-button").textContent = initials(display);
    $("#profile-dialog").close(); toast("Perfil atualizado!");
  } catch (error) { $("#profile-form-message").textContent = error.message || "Não foi possível salvar o perfil."; }
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
supabase.auth.onAuthStateChange((_event, session) => { setTimeout(() => onAuthChange(session?.user || null), 0); });
supabase.auth.getSession().then(({ data, error }) => { if (error) toast(error.message); if (!data.session) onAuthChange(null); });
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/service-worker.js").catch((error) => console.warn("Service worker não registrado:", error)));
}