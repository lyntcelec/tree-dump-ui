<template>
  <div style="padding: 20px;">
    <div style="display: flex; align-items: center; margin-bottom: 20px;">
      <ElInput v-model="path" placeholder="Current Path" @change="onPathChange" clearable style="flex: 1;" />
      <ElButton type="primary" @click="browseDirectory" style="margin-left: 10px;">
        Browse
      </ElButton>
    </div>
    <ElTree v-if="treeData.length > 0" :data="treeData" show-checkbox node-key="id"
      :default-checked-keys="defaultCheckedKeys" :props="defaultProps" ref="treeRef" />
    <ElButton type="primary" @click="saveSelected" style="margin-top: 20px;">
      Save
    </ElButton>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { ElTree, ElInput, ElButton, ElMessage } from "element-plus";

const path = ref("");
const treeData = ref([]);
const defaultProps = {
  children: "children",
  label: "label",
};
const treeRef = ref();
const defaultCheckedKeys = ref([]);

const getCheckedNodeIds = (nodes: any[]): string[] => {
  let ids: string[] = [];
  nodes.forEach(node => {
    if (node.checked) {
      ids.push(node.id);
    }
    if (node.children) {
      ids = ids.concat(getCheckedNodeIds(node.children));
    }
  });
  return ids;
};

const loadTreeData = async () => {
  if (path.value && path.value.trim() !== "") {
    const data = await window.api.scanDirectory(path.value);
    treeData.value = data;
    defaultCheckedKeys.value = getCheckedNodeIds(treeData.value);
  }
};

const onPathChange = async () => {
  await loadTreeData();
  await window.api.saveConfig(path.value); // Save current path to config
};

const browseDirectory = async () => {
  const selectedPath = await window.api.openDirectory();
  if (selectedPath) {
    path.value = selectedPath;
    await loadTreeData();
    await window.api.saveConfig(path.value); // Save current path to config
  }
};

const saveSelected = async () => {
  const checkedNodes = treeRef.value.getCheckedNodes(true, false);

  // Clean up the data to only include serializable properties
  const serializableNodes = checkedNodes.map((node: any) => ({
    id: node.id,
    label: node.label
  }));

  console.log(serializableNodes);

  try {
    await window.api.saveTreedump(path.value, serializableNodes);
    ElMessage.success("Selected directories saved to treedump.json");
  } catch (error) {
    ElMessage.error("Failed to save treedump.json");
  }
};

onMounted(async () => {
  const savedPath = await window.api.loadConfig();
  if (savedPath) {
    path.value = savedPath;
    await loadTreeData();
  }
});
</script>

<style scoped>
.ElInput {
  margin-bottom: 20px;
}
</style>
