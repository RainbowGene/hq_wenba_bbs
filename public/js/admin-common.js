// admin-common.js - 后台公共函数
async function loadCategorySelect(selectElement, selectedId) {
  const res = await api("/api/public/categories");
  if (res.code !== 200) return;
  const tree = res.data;
  selectElement.innerHTML = '<option value="">选择分类</option>';
  function addOptions(list) {
    list.forEach((cat) => {
      if (cat.children && cat.children.length > 0) {
        cat.children.forEach((sub) => {
          const option = document.createElement("option");
          option.value = sub.id;
          option.textContent = `${cat.name} > ${sub.name}`;
          if (sub.id == selectedId) option.selected = true;
          selectElement.appendChild(option);
        });
      } else if (!cat.parent_id) {
        const option = document.createElement("option");
        option.value = cat.id;
        option.textContent = cat.name;
        if (cat.id == selectedId) option.selected = true;
        selectElement.appendChild(option);
      }
    });
  }
  addOptions(tree);
}
