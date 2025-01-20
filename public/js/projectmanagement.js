import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Plus, Check, AlertCircle, Clock, ArrowRight } from 'lucide-react';

const ProjectManagement = () => {
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [newProject, setNewProject] = useState({ name: '', description: '', status: 'planned' });
  const [newTask, setNewTask] = useState({ projectId: '', description: '', priority: 'medium', status: 'todo' });

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const snapshot = await firebase.database().ref('projects').once('value');
      const projectsData = snapshot.val();
      if (projectsData) {
        const projectsArray = Object.entries(projectsData).map(([id, data]) => ({
          id,
          ...data
        }));
        setProjects(projectsArray);
        loadTasks(projectsArray.map(p => p.id));
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  };

  const loadTasks = async (projectIds) => {
    try {
      const tasksData = [];
      for (const projectId of projectIds) {
        const snapshot = await firebase.database().ref(`tasks/${projectId}`).once('value');
        const projectTasks = snapshot.val();
        if (projectTasks) {
          tasksData.push(...Object.entries(projectTasks).map(([id, data]) => ({
            id,
            projectId,
            ...data
          })));
        }
      }
      setTasks(tasksData);
    } catch (error) {
      console.error('Error loading tasks:', error);
    }
  };

  const handleCreateProject = async () => {
    try {
      const projectRef = firebase.database().ref('projects').push();
      await projectRef.set({
        ...newProject,
        createdAt: Date.now()
      });
      setNewProject({ name: '', description: '', status: 'planned' });
      loadProjects();
    } catch (error) {
      console.error('Error creating project:', error);
    }
  };

  const handleCreateTask = async () => {
    try {
      const taskRef = firebase.database().ref(`tasks/${newTask.projectId}`).push();
      await taskRef.set({
        ...newTask,
        createdAt: Date.now()
      });
      setNewTask({ projectId: '', description: '', priority: 'medium', status: 'todo' });
      loadTasks([newTask.projectId]);
    } catch (error) {
      console.error('Error creating task:', error);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <Check className="h-4 w-4 text-green-500" />;
      case 'in_progress':
        return <Clock className="h-4 w-4 text-blue-500" />;
      case 'blocked':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <ArrowRight className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div className="p-6">
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4">Project Management</h2>
        
        {/* Add Project Form */}
        <Card className="mb-6">
          <CardHeader>
            <h3 className="text-lg font-semibold">Add New Project</h3>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <input
                type="text"
                placeholder="Project Name"
                className="flex-1 p-2 border rounded"
                value={newProject.name}
                onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
              />
              <input
                type="text"
                placeholder="Description"
                className="flex-1 p-2 border rounded"
                value={newProject.description}
                onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
              />
              <select
                className="p-2 border rounded"
                value={newProject.status}
                onChange={(e) => setNewProject({ ...newProject, status: e.target.value })}
              >
                <option value="planned">Planned</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
              <button
                className="bg-blue-500 text-white px-4 py-2 rounded flex items-center gap-2"
                onClick={handleCreateProject}
              >
                <Plus className="h-4 w-4" />
                Add Project
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Projects List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map(project => (
            <Card key={project.id} className="bg-white">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <h4 className="text-lg font-semibold">{project.name}</h4>
                  <p className="text-sm text-gray-500">{project.description}</p>
                </div>
                {getStatusIcon(project.status)}
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Tasks for this project */}
                  {tasks
                    .filter(task => task.projectId === project.id)
                    .map(task => (
                      <div
                        key={task.id}
                        className="flex items-center justify-between p-2 bg-gray-50 rounded"
                      >
                        <span>{task.description}</span>
                        <span className={`px-2 py-1 rounded text-sm ${
                          task.priority === 'high' ? 'bg-red-100 text-red-800' :
                          task.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {task.priority}
                        </span>
                      </div>
                    ))
                  }
                  
                  {/* Add Task Form */}
                  <div className="flex gap-2 mt-4">
                    <input
                      type="text"
                      placeholder="New task"
                      className="flex-1 p-2 border rounded"
                      value={newTask.projectId === project.id ? newTask.description : ''}
                      onChange={(e) => setNewTask({
                        ...newTask,
                        projectId: project.id,
                        description: e.target.value
                      })}
                    />
                    <select
                      className="p-2 border rounded"
                      value={newTask.projectId === project.id ? newTask.priority : 'medium'}
                      onChange={(e) => setNewTask({
                        ...newTask,
                        projectId: project.id,
                        priority: e.target.value
                      })}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                    <button
                      className="bg-green-500 text-white px-3 py-2 rounded"
                      onClick={() => newTask.projectId === project.id && handleCreateTask()}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ProjectManagement;