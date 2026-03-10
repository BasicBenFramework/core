import { useState, useEffect } from 'react'
import { PageHeader } from '../components/PageHeader'
import { PostCard } from '../components/PostCard'
import { Loading } from '../components/Loading'
import { Empty } from '../components/Empty'
import { api } from '../api'
import { AppLayout } from '../layouts/AppLayout'

export function Feed({ navigate }) {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api('/api/feed').then(data => setPosts(data.posts)).finally(() => setLoading(false))
  }, [])

  if (loading) return <Loading />

  return (
    <div>
      <PageHeader title="Feed" />
      {posts.length === 0 ? (
        <Empty>No posts yet</Empty>
      ) : (
        <div className="space-y-4">
          {posts.map(post => (
            <PostCard key={post.id} post={post} onClick={() => navigate('feedPost', post.id)} showAuthor />
          ))}
        </div>
      )}
    </div>
  )
}

Feed.layout = page => <AppLayout>{page}</AppLayout>
