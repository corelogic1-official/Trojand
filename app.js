import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore, collection, doc, setDoc, addDoc, getDoc, getDocs,
  query, where, orderBy, limit, onSnapshot, serverTimestamp,
  updateDoc, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = id => document.getElementById(id);
let currentUser = null;
let currentProfile = null;
let activeConversation = null;
let activeUnsubscribe = null;
let groupUnsubscribe = null;
let dmUnsubscribe = null;
let groupsCache = [];
let dmsCache = [];

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.remove("hidden");
  setTimeout(() => $("toast").classList.add("hidden"), 3500);
}
function escapeText(value) {
  return String(value ?? "");
}
function showModal(title, html) {
  $("modal-title").textContent = title;
  $("modal-body").innerHTML = html;
  $("modal").classList.remove("hidden");
}
function closeModal() { $("modal").classList.add("hidden"); }
function setAuthTab(tab) {
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.authTab === tab));
  $("login-form").classList.toggle("hidden", tab !== "login");
  $("register-form").classList.toggle("hidden", tab !== "register");
}
function setSignedInUI(signedIn) {
  $("auth-view").classList.toggle("hidden", signedIn);
  $("app-view").classList.toggle("hidden", !signedIn);
}
function userName() { return currentProfile?.displayName || currentUser?.email || "User"; }

document.querySelectorAll("[data-auth-tab]").forEach(btn => btn.addEventListener("click", () => setAuthTab(btn.dataset.authTab)));
$("close-modal-btn").addEventListener("click", closeModal);
$("modal").addEventListener("click", e => { if (e.target === $("modal")) closeModal(); });

$("login-form").addEventListener("submit", async e => {
  e.preventDefault();
  try {
    await signInWithEmailAndPassword(auth, $("login-email").value.trim(), $("login-password").value);
  } catch (error) { toast(error.message); }
});

$("register-form").addEventListener("submit", async e => {
  e.preventDefault();
  const displayName = $("register-name").value.trim();
  try {
    const credential = await createUserWithEmailAndPassword(auth, $("register-email").value.trim(), $("register-password").value);
    await updateProfile(credential.user, { displayName });
    await setDoc(doc(db, "users", credential.user.uid), {
      uid: credential.user.uid,
      displayName,
      email: credential.user.email,
      createdAt: serverTimestamp()
    });
    toast("Account created.");
  } catch (error) { toast(error.message); }
});

$("logout-btn").addEventListener("click", () => signOut(auth));
$("create-group-btn").addEventListener("click", openCreateGroupModal);
$("new-message-btn").addEventListener("click", openNewMessageModal);
$("profile-btn").addEventListener("click", openProfileModal);
$("invite-btn").addEventListener("click", openJoinGroupModal);
$("members-btn").addEventListener("click", openMembersModal);
$("leave-group-btn").addEventListener("click", leaveActiveGroup);

$("message-form").addEventListener("submit", async e => {
  e.preventDefault();
  const text = $("message-input").value.trim();
  if (!text || !activeConversation) return;
  $("message-input").value = "";
  try {
    await addDoc(collection(db, activeConversation.path, "messages"), {
      senderId: currentUser.uid,
      senderName: userName(),
      text,
      createdAt: serverTimestamp()
    });
  } catch (error) { toast(error.message); }
});

function activateConversation(conversation) {
  activeConversation = conversation;
  $("conversation-title").textContent = conversation.title;
  $("conversation-subtitle").textContent = conversation.subtitle || "";
  $("message-input").disabled = false;
  $("send-message-btn").disabled = false;
  $("leave-group-btn").classList.toggle("hidden", conversation.type !== "group");
  subscribeMessages(conversation);
}
function subscribeMessages(conversation) {
  if (activeUnsubscribe) activeUnsubscribe();
  $("messages").innerHTML = "";
  const messagesRef = collection(db, conversation.path, "messages");
  const messagesQuery = query(messagesRef, orderBy("createdAt", "asc"), limit(300));
  activeUnsubscribe = onSnapshot(messagesQuery, snapshot => {
    $("messages").innerHTML = "";
    if (snapshot.empty) {
      $("messages").innerHTML = '<div class="empty-state">No messages yet. Say hello!</div>';
      return;
    }
    snapshot.forEach(item => {
      const message = item.data();
      const wrapper = document.createElement("div");
      wrapper.className = "message" + (message.senderId === currentUser.uid ? " mine" : "");
      const meta = document.createElement("div");
      meta.className = "message-meta";
      meta.textContent = `${message.senderName || "User"} · ${formatTimestamp(message.createdAt)}`;
      const body = document.createElement("div");
      body.className = "message-body";
      body.textContent = message.text || "";
      wrapper.append(meta, body);
      $("messages").appendChild(wrapper);
    });
    $("messages").scrollTop = $("messages").scrollHeight;
  }, error => toast(error.message));
}
function formatTimestamp(timestamp) {
  if (!timestamp?.toDate) return "just now";
  return timestamp.toDate().toLocaleString();
}

function subscribeGroups() {
  if (groupUnsubscribe) groupUnsubscribe();
  const groupsQuery = query(collection(db, "groups"), where("memberIds", "array-contains", currentUser.uid), limit(100));
  groupUnsubscribe = onSnapshot(groupsQuery, snapshot => {
    groupsCache = [];
    $("group-list").innerHTML = "";
    snapshot.forEach(item => {
      const group = { id: item.id, ...item.data() };
      groupsCache.push(group);
      const button = document.createElement("button");
      button.className = "nav-item";
      button.textContent = `# ${group.name}`;
      button.addEventListener("click", () => activateConversation({
        type: "group",
        id: group.id,
        path: `groups/${group.id}`,
        title: `# ${group.name}`,
        subtitle: `${group.memberIds?.length || 0} members`
      }));
      $("group-list").appendChild(button);
    });
    if (!snapshot.size) $("group-list").innerHTML = '<div class="muted small-text">No groups yet.</div>';
  }, error => toast(error.message));
}
function subscribeDMs() {
  if (dmUnsubscribe) dmUnsubscribe();
  const dmQuery = query(collection(db, "conversations"), where("memberIds", "array-contains", currentUser.uid), limit(100));
  dmUnsubscribe = onSnapshot(dmQuery, snapshot => {
    dmsCache = [];
    $("dm-list").innerHTML = "";
    snapshot.forEach(item => {
      const dm = { id: item.id, ...item.data() };
      dmsCache.push(dm);
      const otherId = (dm.memberIds || []).find(id => id !== currentUser.uid);
      const otherName = dm.memberNames?.[otherId] || "Personal chat";
      const button = document.createElement("button");
      button.className = "nav-item";
      button.textContent = `@ ${otherName}`;
      button.addEventListener("click", () => activateConversation({
        type: "dm",
        id: dm.id,
        path: `conversations/${dm.id}`,
        title: otherName,
        subtitle: "Personal message"
      }));
      $("dm-list").appendChild(button);
    });
    if (!snapshot.size) $("dm-list").innerHTML = '<div class="muted small-text">No conversations yet.</div>';
  }, error => toast(error.message));
}

function openCreateGroupModal() {
  showModal("Create group", `
    <form id="create-group-form" class="modal-form">
      <input id="new-group-name" placeholder="Group name" maxlength="60" required />
      <input id="new-group-description" placeholder="Description (optional)" maxlength="160" />
      <button class="primary" type="submit">Create group</button>
    </form>
  `);
  $("create-group-form").addEventListener("submit", async e => {
    e.preventDefault();
    const name = $("new-group-name").value.trim();
    const description = $("new-group-description").value.trim();
    if (!name) return;
    try {
      const group = await addDoc(collection(db, "groups"), {
        name, description,
        ownerId: currentUser.uid,
        memberIds: [currentUser.uid],
        createdAt: serverTimestamp()
      });
      closeModal();
      toast(`Group created. ID: ${group.id}`);
    } catch (error) { toast(error.message); }
  });
}
function openJoinGroupModal() {
  showModal("Join group", `
    <form id="join-group-form" class="modal-form">
      <input id="join-group-id" placeholder="Paste group ID" required />
      <button class="primary" type="submit">Join group</button>
    </form>
  `);
  $("join-group-form").addEventListener("submit", async e => {
    e.preventDefault();
    const groupId = $("join-group-id").value.trim();
    try {
      const groupRef = doc(db, "groups", groupId);
      const groupSnap = await getDoc(groupRef);
      if (!groupSnap.exists()) throw new Error("Group not found.");
      await updateDoc(groupRef, { memberIds: arrayUnion(currentUser.uid) });
      closeModal();
      toast("Joined group.");
    } catch (error) { toast(error.message); }
  });
}
async function openNewMessageModal() {
  showModal("New personal message", `
    <form id="new-dm-form" class="modal-form">
      <input id="dm-email" type="email" placeholder="Recipient email" required />
      <button class="primary" type="submit">Start conversation</button>
    </form>
  `);
  $("new-dm-form").addEventListener("submit", async e => {
    e.preventDefault();
    const email = $("dm-email").value.trim().toLowerCase();
    try {
      const usersQuery = query(collection(db, "users"), where("email", "==", email), limit(1));
      const result = await getDocs(usersQuery);
      if (result.empty) throw new Error("No user found with that email.");
      const recipient = result.docs[0].data();
      if (recipient.uid === currentUser.uid) throw new Error("You cannot message yourself.");
      const existing = dmsCache.find(dm => dm.memberIds?.includes(recipient.uid) && dm.memberIds?.includes(currentUser.uid));
      let conversationId = existing?.id;
      if (!conversationId) {
        const names = {};
        names[currentUser.uid] = userName();
        names[recipient.uid] = recipient.displayName || recipient.email;
        const created = await addDoc(collection(db, "conversations"), {
          memberIds: [currentUser.uid, recipient.uid],
          memberNames: names,
          createdAt: serverTimestamp()
        });
        conversationId = created.id;
      }
      closeModal();
      activateConversation({
        type: "dm",
        id: conversationId,
        path: `conversations/${conversationId}`,
        title: recipient.displayName || recipient.email,
        subtitle: "Personal message"
      });
    } catch (error) { toast(error.message); }
  });
}
async function openMembersModal() {
  if (!activeConversation || activeConversation.type !== "group") {
    showModal("Members", '<p class="muted">Select a group first.</p>');
    return;
  }
  const groupSnap = await getDoc(doc(db, "groups", activeConversation.id));
  if (!groupSnap.exists()) return toast("Group no longer exists.");
  const group = groupSnap.data();
  const rows = [];
  for (const uid of group.memberIds || []) {
    const userSnap = await getDoc(doc(db, "users", uid));
    const user = userSnap.exists() ? userSnap.data() : { displayName: uid };
    rows.push(`<div class="member-row"><span>${escapeText(user.displayName || user.email || uid)}</span><span class="muted">${uid === group.ownerId ? "Owner" : "Member"}</span></div>`);
  }
  showModal("Group members", rows.join("") || '<p class="muted">No members.</p>');
}
async function leaveActiveGroup() {
  if (!activeConversation || activeConversation.type !== "group") return;
  const groupRef = doc(db, "groups", activeConversation.id);
  try {
    await updateDoc(groupRef, { memberIds: arrayRemove(currentUser.uid) });
    activeConversation = null;
    $("messages").innerHTML = '<div class="empty-state">You left the group.</div>';
    $("message-input").disabled = true;
    $("send-message-btn").disabled = true;
    toast("You left the group.");
  } catch (error) { toast(error.message); }
}
function openProfileModal() {
  showModal("Your profile", `
    <div class="modal-form">
      <p><strong>Name:</strong> ${escapeText(userName())}</p>
      <p><strong>Email:</strong> ${escapeText(currentUser.email)}</p>
      <p><strong>User ID:</strong> ${escapeText(currentUser.uid)}</p>
    </div>
  `);
}

onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (!user) {
    setSignedInUI(false);
    if (groupUnsubscribe) groupUnsubscribe();
    if (dmUnsubscribe) dmUnsubscribe();
    if (activeUnsubscribe) activeUnsubscribe();
    return;
  }
  setSignedInUI(true);
  $("connection-status").textContent = "Signed in";
  $("current-user-label").textContent = user.displayName || user.email;
  const profileSnap = await getDoc(doc(db, "users", user.uid));
  currentProfile = profileSnap.exists() ? profileSnap.data() : { displayName: user.displayName, email: user.email };
  subscribeGroups();
  subscribeDMs();
});
