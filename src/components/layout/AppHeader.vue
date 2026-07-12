<script setup lang="ts">
import { useRoute } from 'vue-router'
import { SettingOutlined, HomeOutlined, FileTextOutlined } from '@ant-design/icons-vue'

const route = useRoute()
</script>

<template>
  <a-layout-header
    style="background: #fff; padding: 0 24px; display: flex; align-items: center; box-shadow: 0 1px 4px rgba(0,0,0,.08)"
  >
    <div style="font-size: 18px; font-weight: 600; color: #1677ff; margin-right: 32px">
      语文教材工具
    </div>
    <a-menu
      mode="horizontal"
      :selected-keys="[route.name as string]"
      style="flex: 1; border: none"
    >
      <a-menu-item key="home">
        <router-link to="/">
          <HomeOutlined /> 工作区
        </router-link>
      </a-menu-item>
      <a-menu-item key="templates">
        <router-link to="/templates">
          <FileTextOutlined /> 模板管理
        </router-link>
      </a-menu-item>
      <a-menu-item key="settings">
        <router-link to="/settings">
          <SettingOutlined /> 设置
        </router-link>
      </a-menu-item>
    </a-menu>
  </a-layout-header>
</template>
