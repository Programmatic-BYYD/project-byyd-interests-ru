const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSKAegO_XsFKuzITukd32ApX3ol_TaVORB243OEWb1kYqh16eMBbkj5glkeaenRhPvJVOl3IqJmmR1a/pub?output=xlsx';

// Пытаемся сразу загрузить данные из кэша браузера
let globalData = JSON.parse(localStorage.getItem('iab_data_cache')) || {}; 
let selected = new Set();

const layoutMap = {'q':'й', 'w':'ц', 'e':'у', 'r':'к', 't':'е', 'y':'н', 'u':'г', 'i':'ш', 'o':'щ', 'p':'з', '[':'х', ']':'ъ', 'a':'ф', 's':'ы', 'd':'в', 'f':'а', 'g':'п', 'h':'р', 'j':'о', 'k':'л', 'l':'д', ';':'ж', "'":'э', 'z':'я', 'x':'ч', 'c':'с', 'v':'м', 'b':'и', 'n':'т', 'm':'ь', ',':'б', '.':'ю'};
const fixLayout = text => text.split('').map(char => layoutMap[char.toLowerCase()] || char).join('');

// Если в кэше есть данные, отображаем их немедленно
if (Object.keys(globalData).length > 0) {
    renderAll();
}

// Поиск совпадений
function isSmartMatch(text, query) {
    if (!query) return true;
    const regex = new RegExp(`(^|\\s|[\\s\\(\\)])(${query})`, 'i');
    return regex.test(text);
}

// Подсветка
function highlight(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}

// Основная функция загрузки (теперь работает быстрее и с кэшем)
async function loadData() {
    try {
        // Устанавливаем таймаут для запроса, чтобы долго не ждать плохую связь
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(SHEET_URL, { signal: controller.signal });
        clearTimeout(timeoutId);

        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(sheet);

        const newData = {};
        rawData.forEach(row => {
            const cat = row.Category || 'Без категории';
            const int = row.Interest;
            if (int) {
                if (!newData[cat]) newData[cat] = [];
                newData[cat].push(int);
            }
        });

        // Проверяем, отличаются ли новые данные от кэшированных
        if (JSON.stringify(newData) !== JSON.stringify(globalData)) {
            globalData = newData;
            localStorage.setItem('iab_data_cache', JSON.stringify(newData));
            renderAll();
        }
    } catch (e) {
        console.warn("Не удалось обновить данные из сети, использую кэш.");
        if (Object.keys(globalData).length === 0) {
            document.getElementById('categories').innerHTML = "Ошибка загрузки. Проверьте интернет.";
        }
    }
}

// Функции рендеринга
function renderCategories() {
    const categoriesDiv = document.getElementById('categories');
    if (!categoriesDiv) return;
    
    categoriesDiv.innerHTML = '';
    const query = document.getElementById('search').value.toLowerCase();
    const fixedQuery = fixLayout(query);

    for (const category in globalData) {
        const isCatMatch = isSmartMatch(category, query) || isSmartMatch(category, fixedQuery);
        const visibleInterests = globalData[category].filter(i => 
            isCatMatch || isSmartMatch(i, query) || isSmartMatch(i, fixedQuery)
        );

        if (visibleInterests.length === 0 && !isCatMatch) continue;

        const details = document.createElement('details');
        details.open = true;

        const summary = document.createElement('summary');
        const catCheck = document.createElement('input');
        catCheck.type = 'checkbox';
        catCheck.checked = globalData[category].every(i => selected.has(i)) && globalData[category].length > 0;
        catCheck.indeterminate = globalData[category].some(i => selected.has(i)) && !catCheck.checked;

        catCheck.onchange = (e) => {
            globalData[category].forEach(i => e.target.checked ? selected.add(i) : selected.delete(i));
            renderAll();
        };

        const activeQuery = isSmartMatch(category, query) ? query : (isSmartMatch(category, fixedQuery) ? fixedQuery : "");
        summary.innerHTML = "";
        summary.append(catCheck);
        const catTitle = document.createElement('span');
        catTitle.innerHTML = highlight(category, activeQuery);
        summary.appendChild(catTitle);
        details.appendChild(summary);

        const list = document.createElement('div');
        list.className = 'interests';
        visibleInterests.forEach(i => {
            const label = document.createElement('label');
            const check = document.createElement('input');
            check.type = 'checkbox';
            check.checked = selected.has(i);
            check.onchange = () => {
                check.checked ? selected.add(i) : selected.delete(i);
                renderAll();
            };
            const activeIntQuery = isSmartMatch(i, query) ? query : (isSmartMatch(i, fixedQuery) ? fixedQuery : "");
            label.append(check);
            const intTitle = document.createElement('span');
            intTitle.innerHTML = highlight(i, activeIntQuery);
            label.appendChild(intTitle);
            list.appendChild(label);
        });
        details.appendChild(list);
        categoriesDiv.appendChild(details);
    }
}

// Работа с выбранными
function renderSelected() {
    const div = document.getElementById('selected');
    if (!div) return;
    div.innerHTML = '';
    document.getElementById('count').textContent = selected.size;
    [...selected].sort().forEach(i => {
        const row = document.createElement('div');
        row.className = 'selected-row';
        const safeItem = i.replace(/`/g, "\\`").replace(/\$/g, "\\$");
        row.innerHTML = `<button onclick="removeOne(\`${safeItem}\`)">✕</button><span>${i}</span>`;
        div.appendChild(row);
    });
}

// Утилиты
function removeOne(item) { selected.delete(item); renderAll(); }
function selectAll() { Object.values(globalData).flat().forEach(i => selected.add(i)); renderAll(); }
function clearInterests() { selected.clear(); renderAll(); }
function renderAll() { renderCategories(); renderSelected(); }

function showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
    }, 2000);
}

function copyInterests() {
    let output = "";
    for (const category in globalData) {
        const items = globalData[category].filter(i => selected.has(i));
        if (items.length > 0) {
            output += `${category}\n${items.join('\n')}\n\n`;
        }
    }
    if (output) {
        navigator.clipboard.writeText(output.trim()).then(() => showToast("✨ Скопировано"));
    }
}

document.getElementById('search').oninput = () => renderCategories();
document.getElementById('clear-search').onclick = () => { 
    document.getElementById('search').value = ''; 
    renderAll(); 
};

// Запуск фоновой загрузки
loadData();