<template>
    <Layout>
      <template #doc-after>
        <div v-if="initGitalkStep" id="gitalk-container"></div>
      </template>
    </Layout>
  </template>
  
  <script lang="ts" setup>
  import { useRoute } from 'vitepress'
  import Theme from 'vitepress/theme'
  import { ref, watch, onMounted, nextTick } from 'vue'
  import Gitalk from 'gitalk'
  
  const { Layout } = Theme
  const route = useRoute()
  // 当前加载状态
  // 0 DOM 中无元素，此时调用应将元素插入到 DOM 中，等下个 step 再加载
  // 1 DOM 中有元素，此时调用应用已有 DOM 元素初始化评论插件，加载后步骤完成，不需要再做什么了
  // 2 插件已经加载，此时调用应是切换页面了，应删除页面中的 DOM 元素，等下个 step 再插入
  const initGitalkStep = ref(0)
  
  const initGitalk = () => {
    // 切换页面时，刷新评论组件
    switch (initGitalkStep.value) {
      case 0: // DOM 中无元素，此时调用应将元素插入到 DOM 中，等下个 step 再加载
        initGitalkStep.value = 1
        nextTick(initGitalk)
        return
      case 1: // DOM 中有元素，此时调用应用已有 DOM 元素初始化评论插件，加载后步骤完成，不需要再做什么了
        initGitalkStep.value = 2
        break
      case 2: // 插件已经加载，此时调用应是切换页面了，应删除页面中的 DOM 元素，等下个 step 再插入
        initGitalkStep.value = 0
        nextTick(initGitalk)
        return
    }
  
    // 创建评论组件
    const gitTalk = new Gitalk({
      // GitHub 账号
      owner: 'cmjzzx',
      // 仓库名
      repo: 'blog',
      // 客户端 ID
      clientID: '3910fdfead0299a18e07',
      // 客户端密钥
      clientSecret: '9f58ae018c6155f06b380a6d6adedc041470f1e7',
      // Github 账号
      admin: [ 'cmjzzx' ],
      // 创建 Issue 时，为 Issue 增加的标签
      labels: [ 'GitTalk' ],
      // 如果 Issue 不存在，且登陆的是管理员账号，是否显示创建 Issue 按钮
      createIssueManually: true,
      // 创建 Issue 时，用于唯一标识这篇文章的标记
      id: location.pathname,
      // 撰写评论时，给一个全屏遮罩，聚焦到评论框
      distractionFreeMode: true,
    })
    // 渲染到 DOM 元素中
    gitTalk.render('gitalk-container')
  }
  
  // 初始化和页面切换时加载评论插件
  onMounted(initGitalk)
  watch(
    () => route.path,
    initGitalk,
  )
  </script>
  