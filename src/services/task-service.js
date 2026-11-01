// Las operaciones de E/S se coordinan aquí; las transformaciones viven en domain/.
export function taskService(repository, events) {
  return {
    ...repository,
    create(owner, input) {
      const task = repository.create(owner, input);
      events.publish(owner, 'created', task);
      return task;
    },
    update(owner, id, version, input) {
      const task = repository.update(owner, id, version, input);
      events.publish(owner, 'updated', task);
      return task;
    },
    remove(owner, id, version) {
      repository.remove(owner, id, version);
      events.publish(owner, 'deleted', { id });
    }
  };
}
