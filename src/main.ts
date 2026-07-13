import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Antd from 'ant-design-vue'
import Vue3ColorPicker from 'vue3-colorpicker'
import App from './App.vue'
import router from './router'
import 'ant-design-vue/dist/reset.css'
import 'vue3-colorpicker/style.css'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(Antd)
app.use(Vue3ColorPicker)
app.mount('#app')
