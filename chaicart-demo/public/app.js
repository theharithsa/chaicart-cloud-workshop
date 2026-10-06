import { beginRumAction, withRumAction, rumEvent } from './rum-actions.js';
import {
  currentCustomer,
  customerHeaders,
  onCustomerChange,
  signInCustomer,
  signOutCustomer,
  initializeCustomerAuth,
} from "./customer-auth.js";
const $ = (s) => document.querySelector(s);
let menu = [],
  cart = {},
  busy = false,
  order = null,
  timer;
const cupArt =
  '<svg viewBox="0 0 280 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" class="brew-illustration"><ellipse cx="140" cy="186" rx="93" ry="12" fill="#233e34" opacity=".12"/><path d="M195 93h18c35 0 35 55 0 55h-24" fill="none" stroke="#315447" stroke-width="13"/><path d="M63 87h141l-14 74c-5 28-100 28-110 0Z" fill="#faf6ed" stroke="#315447" stroke-width="5"/><ellipse cx="134" cy="88" rx="70" ry="17" fill="#d8aa72" stroke="#315447" stroke-width="5"/><ellipse cx="134" cy="88" rx="57" ry="10" fill="#7d4830"/><path d="M95 64c-20-20 18-24 2-44M132 64c-20-20 18-24 2-44M170 64c-20-20 18-24 2-44" stroke="#a34e32" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M87 124h93" stroke="#dd6835" stroke-width="14"/><path d="M106 140h56" stroke="#315447" stroke-width="3" opacity=".35"/></svg>';
const snackArt =
  '<svg viewBox="0 0 280 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" class="brew-illustration"><ellipse cx="140" cy="181" rx="94" ry="15" fill="#233e34" opacity=".12"/><ellipse cx="140" cy="165" rx="100" ry="23" fill="#faf6ed" stroke="#315447" stroke-width="4"/><path d="M44 150l67-108 70 113Z" fill="#d8aa72" stroke="#7d4830" stroke-width="4" stroke-linejoin="round"/><path d="M126 155l51-88 65 84Z" fill="#e8bd7d" stroke="#7d4830" stroke-width="4" stroke-linejoin="round"/><path d="M68 143l40-67M155 147l23-44" stroke="#faf6ed" stroke-width="6" stroke-linecap="round" opacity=".65"/></svg>';
try {
  cart = JSON.parse(localStorage.getItem("chaicart-cart") || "{}");
} catch {}
if (!cart || typeof cart !== "object" || Array.isArray(cart)) cart = {};
function render() {
  const items = menu.filter((m) => cart[m.id] > 0);
  $("#count").textContent = items.reduce((s, m) => s + cart[m.id], 0);
  $("#cart-items").replaceChildren();
  if (!items.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "Your break is waiting. Add a cup of chai to get started.";
    $("#cart-items").append(p);
  }
  items.forEach((m) => {
    const row = document.createElement("div");
    row.className = "cart-row";
    const name = document.createElement("span");
    name.textContent = m.name;
    const controls = document.createElement("div");
    controls.className = "quantity";
    for (const delta of [-1, 1]) {
      const b = document.createElement("button");
      b.textContent = delta < 0 ? "−" : "+";
      b.setAttribute(
        "aria-label",
        (delta < 0 ? "Remove one " : "Add one ") + m.name,
      );
      b.disabled = busy;
      b.onclick = () => {
        const action=beginRumAction("Add Item to Cart");
        cart[m.id] = Math.min(20, Math.max(0, cart[m.id] + delta));
        render();
        action.end();
      };
      controls.append(b);
      if (delta === -1) {
        const q = document.createElement("span");
        q.textContent = cart[m.id];
        controls.append(q);
      }
    }
    row.append(name, controls);
    $("#cart-items").append(row);
  });
  const subtotal = items.reduce((s, m) => s + m.price * cart[m.id], 0);
  $("#totals").innerHTML = subtotal
    ? `<div class="total-row"><span>Subtotal</span><span>₹${subtotal}</span></div><div class="total-row"><span>Delivery</span><span>₹10</span></div><div class="total-row grand"><span>Total</span><span>₹${subtotal + 10}</span></div>`
    : "";
  $("#mobile-cart").hidden = !subtotal;
  $("#mobile-cart-summary").textContent =
    `${$("#count").textContent} ${$("#count").textContent === "1" ? "item" : "items"} · ₹${subtotal + 10}`;
  $("#checkout").disabled = busy || !subtotal;
  $("#checkout").textContent = busy
    ? "Brewing your order…"
    : currentCustomer()
      ? "Place demo order →"
      : "Sign in to order →";
  $("#city").disabled = busy;
  document
    .querySelectorAll(".product .add")
    .forEach((b) => (b.disabled = busy));
  $("#customer-logout").disabled = busy;
  localStorage.setItem("chaicart-cart", JSON.stringify(cart));
}
async function track() {
  if (!order) return;
  try {
    const res = await fetch("/api/orders/" + order.id, {
      headers: {
        ...(await customerHeaders()),
        "x-transaction-id": order.transactionId,
      },
    });
    if (!res.ok) throw new Error("Tracking unavailable");
    const data = await res.json();
    $("#order-summary").textContent =
      `${order.id} · ${order.city} · ₹${order.total} · ${data.status}`;
    $("#steps").replaceChildren();
    for (const stage of ["Brewing", "Packing", "Rider assigned", "Delivered"]) {
      const e = document.createElement("span");
      e.className = "step" + (stage === data.status ? " active" : "");
      e.textContent = stage;
      $("#steps").append(e);
    }
    if (data.status === "Delivered") clearInterval(timer);
  } catch {
    $("#order-summary").textContent =
      "Order placed. Tracking is temporarily unavailable.";
  }
}
$("#checkout").onclick = async () => {
  if (!currentCustomer()) {
    try {
      await signInCustomer();
      $("#feedback").textContent =
        "Signed in. Review your cart, then place your demo order.";
    } catch (e) {
      $("#feedback").textContent =
        "Sign-in was not completed. Your cart is saved; try again when ready.";
    }
    return;
  }
  const transactionId=crypto.randomUUID();
  const rumAction=beginRumAction("Submit Checkout",{transaction_id:transactionId,item_count:menu.reduce((n,m)=>n+(cart[m.id]||0),0),currency:"INR"});
  let checkoutOutcome="failure";
  busy = true;
  render();
  $("#feedback").className = "";
  $("#feedback").textContent =
    "Payment processing. This is a demo; you will not be charged.";
  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-transaction-id": transactionId,
        ...(await customerHeaders()),
      },
      body: JSON.stringify({
        city: $("#city").value,
        items: menu
          .filter((m) => cart[m.id] > 0)
          .map((m) => ({ id: m.id, quantity: cart[m.id] })),
      }),
    });
    const data = await res.json();
    if (!res.ok)
      throw new Error(
        data.error +
          " Receipt: " +
          (data.traceId || res.headers.get("x-trace-id")),
      );
    order = data;
    checkoutOutcome="success";
    rumEvent("checkout_success",{order_id:data.id,transaction_id:transactionId,total_value:data.total,currency:"INR"});
    cart = {};
    await history();
    $("#feedback").textContent = "Order placed. Time for a chai break.";
    $("#tracking").hidden = false;
    $("#order-summary").textContent =
      `${order.id} · ${order.city} · ₹${order.total} · Estimated 10 minutes`;
    $("#receipt").textContent = "Trace ID: " + order.traceId;
    clearInterval(timer);
    await track();
    timer = setInterval(track, 3000);
    $("#tracking").scrollIntoView({ behavior: "smooth" });
  } catch (e) {
    $("#feedback").className = "error";
    $("#feedback").textContent = e.message;
  } finally {
    rumAction.end(checkoutOutcome,{...(order && checkoutOutcome === "success" ? {order_id:order.id} : {})});
    busy = false;
    render();
  }
};
async function init() {
  try {
    const res = await withRumAction("Load Menu",()=>fetch("/api/menu"));
    if (!res.ok) throw new Error("Menu unavailable");
    menu = (await res.json()).items;
    for (const key of Object.keys(cart))
      if (
        !menu.some((m) => m.id === key) ||
        !Number.isInteger(cart[key]) ||
        cart[key] < 0 ||
        cart[key] > 20
      )
        delete cart[key];
    menu.forEach((m) => {
      const el = document.createElement("article");
      el.className = "product";
      el.innerHTML = `<div class="product-art"><span class="tag">${m.tag}</span>${m.id === "samosa" ? snackArt : cupArt}</div><h3>${m.name}</h3><p>${m.description}</p><div class="product-bottom"><strong>₹${m.price}</strong><button class="add" aria-label="Add ${m.name}">Add +</button></div>`;
      el.querySelector("button").onclick = () => {
        const action=beginRumAction("Add Item to Cart");
        cart[m.id] = Math.min(20, (cart[m.id] || 0) + 1);
        render();
        action.end();
      };
      $("#menu-items").append(el);
    });
    render();
  } catch {
    $("#menu-items").textContent =
      "The kitchen is offline. Refresh to try again.";
  }
}
async function history() {
  if (!currentCustomer()) return;
  try {
    const res = await fetch("/api/orders", {
      headers: await customerHeaders(),
    });
    if (!res.ok) return;
    const data = await res.json();
    $("#history").hidden = false;
    $("#history-items").replaceChildren();
    if (!data.orders.length) {
      const empty = document.createElement("p");
      empty.textContent = "Your confirmed orders will appear here.";
      $("#history-items").append(empty);
    }
    for (const o of data.orders) {
      const card = document.createElement("article");
      card.className = "order-card";
      const title = document.createElement("h3");
      title.textContent = `Order ${o.id}`;
      const details = document.createElement("p");
      details.textContent = `${o.city} · ₹${o.total}`;
      const status = document.createElement("span");
      status.className = "order-status";
      status.textContent = o.status || "Order received";
      card.append(title, details, status);
      $("#history-items").append(card);
    }
  } catch {}
}
onCustomerChange((user) => {
  clearInterval(timer);
  order = null;
  $("#tracking").hidden = true;
  $("#history").hidden = !user;
  $("#history-items").replaceChildren();
  $("#customer-name").textContent = user
    ? user.email
    : $("#customer-login").textContent === "Sign in (demo)"
      ? "Local preview · Google sign-in needs Firebase setup"
      : "";
  $("#customer-login").hidden = Boolean(user);
  $("#customer-logout").hidden = !user;
  $("#feedback").textContent = "";
  render();
  if (user) history();
});
$("#customer-login").onclick = async () => {
  try {
    await signInCustomer();
  } catch (e) {
    $("#feedback").textContent = e.message;
  }
};
$("#customer-logout").onclick = signOutCustomer;
initializeCustomerAuth().catch((e) => {
  $("#customer-name").textContent = "Sign-in unavailable: " + e.message;
});
init();
