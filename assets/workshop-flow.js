
const cards=[...document.querySelectorAll('.activity')];
const sections=[...document.querySelectorAll('.day-section')];
const filters=[...document.querySelectorAll('[data-filter]')];
const search=document.querySelector('#activity-search');
let selected=['1','2','all'].includes(location.hash.slice(1))?location.hash.slice(1):'1';
function render(){
 const term=search.value.trim().toLowerCase();let count=0;
 cards.forEach(card=>{card.hidden=!(selected==='all'||card.dataset.day===selected)||!card.textContent.toLowerCase().includes(term);if(!card.hidden)count++;});
 sections.forEach(section=>{section.hidden=![...section.querySelectorAll('.activity')].some(card=>!card.hidden);});
 filters.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.filter===selected)));
 document.querySelector('#result-count').textContent=`${count} ${count === 1 ? "step" : "steps"} shown · Open any step for the five-role handoff`;
 document.querySelector('#no-results').hidden=count!==0;
}
filters.forEach(button=>button.addEventListener('click',()=>{selected=button.dataset.filter;history.replaceState(null,'','#'+selected);render();}));
search.addEventListener('input',render);
document.querySelector('#expand').addEventListener('click',()=>cards.filter(card=>!card.hidden).forEach(card=>card.open=true));
document.querySelector('#collapse').addEventListener('click',()=>cards.forEach(card=>card.open=false));
window.addEventListener('beforeprint',()=>cards.forEach(card=>{card.dataset.wasOpen=String(card.open);card.open=true;}));
window.addEventListener('afterprint',()=>cards.forEach(card=>{card.open=card.dataset.wasOpen==='true';}));
render();
