// 动态加载公共组件到指定元素中
async function loadComponent(selector, filePath) {
  try {
    const response = await fetch(filePath);
    const html = await response.text();
    document.querySelector(selector).innerHTML = html;
  } catch (error) {
    console.error(`加载 ${filePath} 失败:`, error);
  }
}

// 加载完成后执行附加初始化（如下拉菜单移动端交互）
document.addEventListener("DOMContentLoaded", () => {
  // 先加载组件，再初始化交互
  Promise.all([
    loadComponent("#header-placeholder", "components/header.html"),
    loadComponent("#navigator-placeholder", "components/navigator.html"),
    loadComponent("#footer-placeholder", "components/footer.html")
  ]).then(() => {
    // 重新初始化导航交互（因为动态插入的内容需要重新绑定事件）
    initDropdowns();
  });
});

function initDropdowns() {
  const taxonomyLi = document.getElementById('taxonomy-item');
  if (!taxonomyLi) return;
  let isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  let isMobileView = window.matchMedia("(max-width: 780px)").matches;

  function handleClick(e) {
    if (window.innerWidth <= 780 || isTouchDevice) {
      e.stopPropagation();
      if (e.target.closest('.dropdown-menu')) return;
      taxonomyLi.classList.toggle('active');
    }
  }

  if (isTouchDevice || isMobileView) {
    taxonomyLi.addEventListener('click', function(e) {
      if (e.target.tagName === 'A' || e.target === taxonomyLi || e.target.parentElement === taxonomyLi) {
        e.preventDefault();
        taxonomyLi.classList.toggle('active');
      }
    });
  }

  document.addEventListener('click', function(e) {
    if (taxonomyLi.classList.contains('active') && !taxonomyLi.contains(e.target)) {
      taxonomyLi.classList.remove('active');
    }
  });

  window.addEventListener('resize', function() {
    if (window.innerWidth > 780 && taxonomyLi.classList.contains('active')) {
      taxonomyLi.classList.remove('active');
    }
  });
}
